"use client";

import { useEffect, useRef, useImperativeHandle, ForwardedRef } from "react";
import Phaser from "phaser";
import { Agent } from "@/mock_data/agents";
import { AquariumMapHandle } from "./AquariumMap";
import { RoundAction } from "@/lib/api";
import { zonePixel, TILE_SIZE } from "@/constants/mapZones";

interface Props {
  agents: Agent[];
  onSelectAgent: (a: Agent) => void;
  mapRef?: ForwardedRef<AquariumMapHandle>;
}

/** A single step in an agent's round routine. */
interface Waypoint {
  x: number;
  y: number;
  /** How long to pause on arrival (ms, sim time). */
  hold: number;
  onArrive?: () => void;
  arrived?: boolean;
}

/** Phaser scene shape exposing the round choreography to the React handle. */
interface RoundScene extends Phaser.Scene {
  playRound?: (actions: RoundAction[]) => void;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Binary min-heap keyed by numeric priority (used by A*). */
class MinHeap<T> {
  private items: { node: T; pri: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(node: T, pri: number): void {
    this.items.push({ node, pri });
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].pri <= this.items[i].pri) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (n > 1) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        let s = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < this.items.length && this.items[l].pri < this.items[s].pri) s = l;
        if (r < this.items.length && this.items[r].pri < this.items[s].pri) s = r;
        if (s === i) break;
        [this.items[s], this.items[i]] = [this.items[i], this.items[s]];
        i = s;
      }
    }
    return top.node;
  }
}

const SPAWN_POSITIONS: Record<string, { x: number; y: number }> = {
  panic:      { x: 2400, y: 1120 },
  fomo:       { x: 1344, y: 1760 },
  value:      { x: 576,  y: 800 },
  quant:      { x: 2240, y: 1920 },
  whale:      { x: 2560, y: 1600 },
  contrarian: { x: 640,  y: 1920 },
};

const FALLBACK_SPAWNS = [
  { x: 1440, y: 1280 }, { x: 800,  y: 1400 }, { x: 1800, y: 800 },
  { x: 1100, y: 2000 }, { x: 2000, y: 1200 }, { x: 700,  y: 1700 },
  { x: 1600, y: 1600 }, { x: 2200, y: 800 },  { x: 960,  y: 960 },
  { x: 1900, y: 1900 }, { x: 500,  y: 1200 }, { x: 2600, y: 1000 },
  { x: 1200, y: 600 },  { x: 1700, y: 2100 }, { x: 2100, y: 1500 },
  { x: 400,  y: 1600 }, { x: 1500, y: 1000 }, { x: 2300, y: 1800 },
  { x: 850,  y: 2100 },
];

const WANDER_RADIUS = 96;

export default function PhaserGame({ agents, onSelectAgent, mapRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useImperativeHandle(mapRef, () => ({
    zoomIn: () => {
      const scene = gameRef.current?.scene.scenes[0];
      if (scene) {
        const cam = scene.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom + 0.15, 0.3, 3));
      }
    },
    zoomOut: () => {
      const scene = gameRef.current?.scene.scenes[0];
      if (scene) {
        const cam = scene.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - 0.15, 0.3, 3));
      }
    },
    setSpeed: (speed: number) => {
      const scene = gameRef.current?.scene.scenes[0];
      if (scene) {
        scene.time.timeScale = speed;
        scene.physics.world.timeScale = 1 / speed;
        scene.anims.globalTimeScale = speed;
      }
    },
    playRound: (actions: RoundAction[]) => {
      const scene = gameRef.current?.scene.scenes[0] as RoundScene | undefined;
      scene?.playRound?.(actions);
    },
  }));
  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const parent = containerRef.current;

    class MainScene extends Phaser.Scene {
      cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
      agentSprites: {
        sprite: Phaser.GameObjects.Sprite;
        bubble: Phaser.GameObjects.Container;
        agent: Agent;
        homeX: number;
        homeY: number;
        targetX: number;
        targetY: number;
        // Round-routine state (null when idle-wandering).
        script: Waypoint[] | null;
        scriptIdx: number;
        scriptDelay: number;
        holdUntil: number;
        actionBubble: Phaser.GameObjects.Container | null;
      }[] = [];

      /** Tile walkability grid built from the "Collisions" layer. */
      walkable: boolean[][] = [];
      mapWidth = 0;
      mapHeight = 0;

      constructor() {
        super("MainScene");
      }

      preload() {
        // Tilemap
        this.load.tilemapTiledJSON("map", "/assets/the_ville/visuals/the_ville_jan7.json");

        // Tileset images
        this.load.image("blocks_1", "/assets/the_ville/visuals/map_assets/blocks/blocks_1.png");
        this.load.image("Room_Builder_32x32", "/assets/the_ville/visuals/map_assets/v1/Room_Builder_32x32.png");
        this.load.image("interiors_pt1", "/assets/the_ville/visuals/map_assets/v1/interiors_pt1.png");
        this.load.image("interiors_pt2", "/assets/the_ville/visuals/map_assets/v1/interiors_pt2.png");
        this.load.image("interiors_pt3", "/assets/the_ville/visuals/map_assets/v1/interiors_pt3.png");
        this.load.image("interiors_pt4", "/assets/the_ville/visuals/map_assets/v1/interiors_pt4.png");
        this.load.image("interiors_pt5", "/assets/the_ville/visuals/map_assets/v1/interiors_pt5.png");
        this.load.image("CuteRPG_Field_B", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Field_B.png");
        this.load.image("CuteRPG_Field_C", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Field_C.png");
        this.load.image("CuteRPG_Harbor_C", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Harbor_C.png");
        this.load.image("CuteRPG_Village_B", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Village_B.png");
        this.load.image("CuteRPG_Forest_B", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Forest_B.png");
        this.load.image("CuteRPG_Desert_C", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Desert_C.png");
        this.load.image("CuteRPG_Mountains_B", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Mountains_B.png");
        this.load.image("CuteRPG_Desert_B", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Desert_B.png");
        this.load.image("CuteRPG_Forest_C", "/assets/the_ville/visuals/map_assets/cute_rpg_word_VXAce/tilesets/CuteRPG_Forest_C.png");

        // Per-agent spritesheet (96x128, 32x32 frames, 3cols x 4rows)
        const currentAgents = agentsRef.current;
        for (const agent of currentAgents) {
          if (!this.textures.exists(agent.id)) {
            this.load.spritesheet(agent.id, agent.sprite, {
              frameWidth: 32,
              frameHeight: 32,
            });
          }
        }
      }

      create() {
        const map = this.make.tilemap({ key: "map" });

        const tilesets = [
          map.addTilesetImage("blocks", "blocks_1"),
          map.addTilesetImage("Room_Builder_32x32", "Room_Builder_32x32"),
          map.addTilesetImage("interiors_pt1", "interiors_pt1"),
          map.addTilesetImage("interiors_pt2", "interiors_pt2"),
          map.addTilesetImage("interiors_pt3", "interiors_pt3"),
          map.addTilesetImage("interiors_pt4", "interiors_pt4"),
          map.addTilesetImage("interiors_pt5", "interiors_pt5"),
          map.addTilesetImage("CuteRPG_Field_B", "CuteRPG_Field_B"),
          map.addTilesetImage("CuteRPG_Field_C", "CuteRPG_Field_C"),
          map.addTilesetImage("CuteRPG_Harbor_C", "CuteRPG_Harbor_C"),
          map.addTilesetImage("CuteRPG_Village_B", "CuteRPG_Village_B"),
          map.addTilesetImage("CuteRPG_Forest_B", "CuteRPG_Forest_B"),
          map.addTilesetImage("CuteRPG_Desert_C", "CuteRPG_Desert_C"),
          map.addTilesetImage("CuteRPG_Mountains_B", "CuteRPG_Mountains_B"),
          map.addTilesetImage("CuteRPG_Desert_B", "CuteRPG_Desert_B"),
          map.addTilesetImage("CuteRPG_Forest_C", "CuteRPG_Forest_C"),
        ].filter(Boolean) as Phaser.Tilemaps.Tileset[];

        const layerNames = [
          "Bottom Ground",
          "Exterior Ground",
          "Exterior Decoration L1",
          "Exterior Decoration L2",
          "Interior Ground",
          "Wall",
          "Interior Furniture L1",
          "Interior Furniture L2 ",
          "Foreground L1",
          "Foreground L2",
          "Collisions",
        ];

        let collisionsLayer: Phaser.Tilemaps.TilemapLayerBase | null = null;
        for (const name of layerNames) {
          const layer = map.createLayer(name, tilesets);
          if (layer && name === "Collisions") {
            layer.setVisible(false);
            collisionsLayer = layer;
          }
        }

        // Build the walkability grid for client-side A* pathfinding.
        this.mapWidth = map.width;
        this.mapHeight = map.height;
        this.buildWalkable(collisionsLayer);

        // Create per-agent walk animations
        // Spritesheet layout: row0=down(front), row1=left, row2=right, row3=up(back), 3 frames each
        const currentAgents = agentsRef.current;
        const dirMap = [
          { dir: "front", row: 0 },
          { dir: "left", row: 1 },
          { dir: "right", row: 2 },
          { dir: "back", row: 3 },
        ];
        for (const agent of currentAgents) {
          for (const { dir, row } of dirMap) {
            const key = `${agent.id}-${dir}-walk`;
            if (!this.anims.exists(key)) {
              this.anims.create({
                key,
                frames: [
                  { key: agent.id, frame: row * 3 },
                  { key: agent.id, frame: row * 3 + 1 },
                  { key: agent.id, frame: row * 3 + 2 },
                  { key: agent.id, frame: row * 3 + 1 },
                ],
                frameRate: 6,
                repeat: -1,
              });
            }
          }
        }

        // Place agents
        let fallbackIdx = 0;
        for (const agent of currentAgents) {
          let pos = SPAWN_POSITIONS[agent.id];
          if (!pos) {
            pos = FALLBACK_SPAWNS[fallbackIdx % FALLBACK_SPAWNS.length];
            fallbackIdx++;
          }
          // ponytail: frame 0 = front idle
          const sprite = this.physics.add.sprite(pos.x, pos.y, agent.id, 0);
          sprite.setScale(1.5);
          sprite.setInteractive({ useHandCursor: true });
          sprite.on("pointerdown", () => {
            onSelectAgentRef.current(agent);
          });

          // Name label - larger and more visible
          const bubbleBg = this.add.graphics();
          const text = this.add.text(0, 0, agent.alias, {
            fontSize: "13px",
            fontStyle: "bold",
            color: "#ffffff",
            fontFamily: "Pretendard, sans-serif",
            padding: { x: 8, y: 4 },
          });
          text.setOrigin(0.5);

          const w = text.width + 20;
          const h = text.height + 10;
          bubbleBg.fillStyle(0x000000, 0.75);
          bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
          bubbleBg.lineStyle(1, 0xc8a84e, 0.4);
          bubbleBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

          const bubbleContainer = this.add.container(pos.x, pos.y - 40, [bubbleBg, text]);
          bubbleContainer.setDepth(100);

          const homeX = pos.x;
          const homeY = pos.y;
          const targetX = homeX + (Math.random() - 0.5) * WANDER_RADIUS * 2;
          const targetY = homeY + (Math.random() - 0.5) * WANDER_RADIUS * 2;

          this.agentSprites.push({
            sprite,
            bubble: bubbleContainer,
            agent,
            homeX,
            homeY,
            targetX,
            targetY,
            script: null,
            scriptIdx: 0,
            scriptDelay: 0,
            holdUntil: 0,
            actionBubble: null,
          });
        }

        // Camera
        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.centerOn(1500, 1500);
        this.cameras.main.setZoom(0.6);

        this.cursors = this.input.keyboard!.createCursorKeys();

        // Mouse drag to pan
        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let camStartX = 0;
        let camStartY = 0;

        this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
          if (p.downElement?.tagName === "CANVAS") {
            dragging = true;
            dragStartX = p.x;
            dragStartY = p.y;
            camStartX = this.cameras.main.scrollX;
            camStartY = this.cameras.main.scrollY;
          }
        });
        this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
          if (dragging) {
            this.cameras.main.scrollX = camStartX - (p.x - dragStartX) / this.cameras.main.zoom;
            this.cameras.main.scrollY = camStartY - (p.y - dragStartY) / this.cameras.main.zoom;
          }
        });
        this.input.on("pointerup", () => { dragging = false; });

        // Scroll to zoom
        this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gos: unknown, _dx: number, _dy: number, dz: number) => {
          const cam = this.cameras.main;
          const newZoom = Phaser.Math.Clamp(cam.zoom - dz * 0.001, 0.3, 3);
          cam.setZoom(newZoom);
        });
      }

      /**
       * Build walkable[y][x] from the Collisions layer: a tile is BLOCKED where
       * the layer has a real tile (index > 0). If the layer is missing, warn and
       * treat everything as walkable so movement still works.
       */
      buildWalkable(layer: Phaser.Tilemaps.TilemapLayerBase | null) {
        this.walkable = [];
        if (!layer) {
          console.warn(
            "[PhaserGame] 'Collisions' layer not found; treating all tiles as walkable"
          );
          for (let y = 0; y < this.mapHeight; y++) {
            const row: boolean[] = new Array(this.mapWidth).fill(true);
            this.walkable.push(row);
          }
          return;
        }
        const data = layer.layer.data;
        for (let y = 0; y < this.mapHeight; y++) {
          const row: boolean[] = [];
          for (let x = 0; x < this.mapWidth; x++) {
            const tile = data[y]?.[x];
            row.push(!(tile && tile.index > 0));
          }
          this.walkable.push(row);
        }
      }

      inBounds(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.mapWidth && y < this.mapHeight;
      }

      /**
       * Nearest walkable tile to (tx, ty), searched outward BFS-style. When a
       * `claimed` set is provided, skips (and records) already-taken tiles so
       * each agent gets a distinct standing spot. Falls back to (tx, ty).
       */
      findWalkableTile(
        tx: number,
        ty: number,
        claimed?: Set<string>
      ): { x: number; y: number } {
        const queue: Array<[number, number]> = [[tx, ty]];
        const seen = new Set<string>([`${tx},${ty}`]);
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const;
        while (queue.length) {
          const [x, y] = queue.shift()!;
          const key = `${x},${y}`;
          if (this.inBounds(x, y) && this.walkable[y][x] && !claimed?.has(key)) {
            claimed?.add(key);
            return { x, y };
          }
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            const nk = `${nx},${ny}`;
            if (!seen.has(nk) && this.inBounds(nx, ny)) {
              seen.add(nk);
              queue.push([nx, ny]);
            }
          }
        }
        return { x: tx, y: ty };
      }

      /**
       * 4-directional A* over the walkability grid. Returns the list of tiles
       * from start..goal (inclusive). If the goal is blocked it is retargeted to
       * the nearest walkable tile; if no path exists it falls back to
       * [start, goal] so the caller never hangs.
       */
      aStar(
        sx: number,
        sy: number,
        gx: number,
        gy: number
      ): Array<{ x: number; y: number }> {
        if (!this.inBounds(sx, sy)) {
          return [
            { x: sx, y: sy },
            { x: gx, y: gy },
          ];
        }
        if (!this.inBounds(gx, gy) || !this.walkable[gy][gx]) {
          const near = this.findWalkableTile(gx, gy);
          gx = near.x;
          gy = near.y;
        }
        if (sx === gx && sy === gy) return [{ x: sx, y: sy }];

        const W = this.mapWidth;
        const startId = sy * W + sx;
        const goalId = gy * W + gx;
        const h = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

        const open = new MinHeap<number>();
        const gScore = new Map<number, number>();
        const came = new Map<number, number>();
        const closed = new Set<number>();
        gScore.set(startId, 0);
        open.push(startId, h(sx, sy));

        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const;

        while (open.size) {
          const cur = open.pop()!;
          if (closed.has(cur)) continue;
          closed.add(cur);

          if (cur === goalId) {
            const path: Array<{ x: number; y: number }> = [];
            let c: number | undefined = cur;
            while (c !== undefined) {
              const px = c % W;
              const py = (c - px) / W;
              path.push({ x: px, y: py });
              if (c === startId) break;
              c = came.get(c);
            }
            path.reverse();
            return path;
          }

          const cx = cur % W;
          const cy = (cur - cx) / W;
          const g = gScore.get(cur)!;
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (!this.inBounds(nx, ny) || !this.walkable[ny][nx]) continue;
            const nId = ny * W + nx;
            if (closed.has(nId)) continue;
            const ng = g + 1;
            if (ng < (gScore.get(nId) ?? Infinity)) {
              gScore.set(nId, ng);
              came.set(nId, cur);
              open.push(nId, ng + h(nx, ny));
            }
          }
        }

        // No path found.
        return [
          { x: sx, y: sy },
          { x: gx, y: gy },
        ];
      }

      /** Pick a nearby walkable wander target around an agent's home. */
      randomWanderTarget(homeX: number, homeY: number): { x: number; y: number } {
        for (let i = 0; i < 6; i++) {
          const tx = homeX + (Math.random() - 0.5) * WANDER_RADIUS * 2;
          const ty = homeY + (Math.random() - 0.5) * WANDER_RADIUS * 2;
          const cx = Math.floor(tx / TILE_SIZE);
          const cy = Math.floor(ty / TILE_SIZE);
          if (this.inBounds(cx, cy) && this.walkable[cy]?.[cx]) {
            return { x: tx, y: ty };
          }
        }
        return { x: homeX, y: homeY };
      }

      /** Drive a directional walk animation toward (dx, dy). */
      playWalk(a: typeof this.agentSprites[number], dx: number, dy: number) {
        const id = a.agent.id;
        if (Math.abs(dx) > Math.abs(dy)) {
          a.sprite.anims.play(dx < 0 ? `${id}-left-walk` : `${id}-right-walk`, true);
        } else {
          a.sprite.anims.play(dy < 0 ? `${id}-back-walk` : `${id}-front-walk`, true);
        }
      }

      /** Show a transient label above an agent (post text / trade indicator). */
      showActionBubble(a: typeof this.agentSprites[number], label: string, color: number) {
        this.clearActionBubble(a);
        const text = this.add.text(0, 0, label, {
          fontSize: "12px",
          fontStyle: "bold",
          color: "#ffffff",
          fontFamily: "Pretendard, sans-serif",
          align: "center",
          padding: { x: 8, y: 4 },
          wordWrap: { width: 180 },
        });
        text.setOrigin(0.5);
        const w = text.width + 18;
        const h = text.height + 10;
        const bg = this.add.graphics();
        bg.fillStyle(color, 0.92);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
        bg.lineStyle(1, 0xffffff, 0.35);
        bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
        const c = this.add.container(a.sprite.x, a.sprite.y - 62, [bg, text]);
        c.setDepth(120);
        a.actionBubble = c;
      }

      clearActionBubble(a: typeof this.agentSprites[number]) {
        if (a.actionBubble) {
          a.actionBubble.destroy();
          a.actionBubble = null;
        }
      }

      /**
       * Choreograph one round. For each agent: walk to the board (if they
       * posted), then to the exchange (if they traded), then back home and
       * resume wandering. Robust: clean-restarts any in-flight round and
       * skips agents that aren't on the map.
       */
      playRound(actions: RoundAction[]) {
        const now = this.time.now;
        const boardPx = zonePixel("board");
        const exchangePx = zonePixel("exchange");
        const boardTile = {
          x: Math.floor(boardPx.x / TILE_SIZE),
          y: Math.floor(boardPx.y / TILE_SIZE),
        };
        const exchangeTile = {
          x: Math.floor(exchangePx.x / TILE_SIZE),
          y: Math.floor(exchangePx.y / TILE_SIZE),
        };

        // Clean restart: drop any in-flight scripts + bubbles.
        for (const a of this.agentSprites) {
          a.script = null;
          a.scriptIdx = 0;
          this.clearActionBubble(a);
        }

        // Distinct walkable standing tiles per zone so agents don't stack and
        // never stop on a blocked tile.
        const boardClaimed = new Set<string>();
        const exchangeClaimed = new Set<string>();

        actions.forEach((action, i) => {
          const a = this.agentSprites.find((s) => s.agent.id === action.agent_id);
          if (!a) return; // agent not rendered on this map
          if (!action.posted && !action.traded) return; // nothing to show

          const script: Waypoint[] = [];
          let curX = Math.floor(a.sprite.x / TILE_SIZE);
          let curY = Math.floor(a.sprite.y / TILE_SIZE);

          // Append the A* path from the current tile to (gx, gy) as a sequence
          // of pixel waypoints. Only the final waypoint holds + fires onArrive.
          const appendPath = (
            gx: number,
            gy: number,
            hold: number,
            onArrive?: () => void
          ) => {
            const path = this.aStar(curX, curY, gx, gy);
            if (path.length <= 1) {
              script.push({
                x: gx * TILE_SIZE + TILE_SIZE / 2,
                y: gy * TILE_SIZE + TILE_SIZE / 2,
                hold,
                onArrive,
              });
            } else {
              for (let k = 1; k < path.length; k++) {
                const p = path[k];
                const last = k === path.length - 1;
                script.push({
                  x: p.x * TILE_SIZE + TILE_SIZE / 2,
                  y: p.y * TILE_SIZE + TILE_SIZE / 2,
                  hold: last ? hold : 0,
                  onArrive: last ? onArrive : undefined,
                });
              }
              const end = path[path.length - 1];
              gx = end.x;
              gy = end.y;
            }
            curX = gx;
            curY = gy;
          };

          if (action.posted) {
            const t = this.findWalkableTile(boardTile.x, boardTile.y, boardClaimed);
            appendPath(t.x, t.y, 1600, () => {
              const txt = action.post_text?.trim();
              this.showActionBubble(
                a,
                txt && txt.length ? truncate(txt, 40) : "게시글 작성",
                0x6c8cff
              );
            });
          }

          if (action.traded) {
            const isBuy =
              action.trade_action === "BUY" || action.trade_action === "BUY_LARGE";
            const label =
              action.trade_symbol != null
                ? `${action.trade_action} ${action.trade_symbol}`
                : action.trade_action;
            const t = this.findWalkableTile(
              exchangeTile.x,
              exchangeTile.y,
              exchangeClaimed
            );
            appendPath(t.x, t.y, 1400, () => {
              this.showActionBubble(a, label, isBuy ? 0x2fbf71 : 0xe5484d);
            });
          }

          // Return home and resume idle wander.
          const homeTileX = Math.floor(a.homeX / TILE_SIZE);
          const homeTileY = Math.floor(a.homeY / TILE_SIZE);
          appendPath(homeTileX, homeTileY, 0, () => this.clearActionBubble(a));

          a.script = script;
          a.scriptIdx = 0;
          a.holdUntil = 0;
          a.scriptDelay = now + i * 180; // small stagger for readability
        });
      }

      update(_time: number, _delta: number) {
        const cam = this.cameras.main;
        const speed = 8;
        const now = this.time.now;

        if (this.cursors.left.isDown) cam.scrollX -= speed;
        if (this.cursors.right.isDown) cam.scrollX += speed;
        if (this.cursors.up.isDown) cam.scrollY -= speed;
        if (this.cursors.down.isDown) cam.scrollY += speed;

        for (const a of this.agentSprites) {
          const body = a.sprite.body as Phaser.Physics.Arcade.Body;

          if (a.script) {
            // Scripted round routine.
            if (now < a.scriptDelay) {
              body.setVelocity(0, 0);
            } else {
              const wp = a.script[a.scriptIdx];
              const dx = wp.x - a.sprite.x;
              const dy = wp.y - a.sprite.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 6) {
                body.setVelocity(0, 0);
                if (!wp.arrived) {
                  wp.arrived = true;
                  // Only break stride on a real hold; pass through path tiles.
                  if (wp.hold > 0) {
                    a.sprite.anims.stop();
                    a.sprite.setFrame(0);
                  }
                  wp.onArrive?.();
                  a.holdUntil = now + wp.hold;
                }
                if (now >= a.holdUntil) {
                  a.scriptIdx++;
                  if (a.scriptIdx >= a.script.length) {
                    // Routine finished -> resume wandering near home.
                    a.script = null;
                    a.scriptIdx = 0;
                    a.sprite.anims.stop();
                    a.sprite.setFrame(0);
                    const t = this.randomWanderTarget(a.homeX, a.homeY);
                    a.targetX = t.x;
                    a.targetY = t.y;
                  }
                }
              } else {
                const moveSpeed = 150; // faster than wander; zones are far away
                body.setVelocity((dx / dist) * moveSpeed, (dy / dist) * moveSpeed);
                this.playWalk(a, dx, dy);
              }
            }

            a.bubble.setPosition(a.sprite.x, a.sprite.y - 36);
            if (a.actionBubble) a.actionBubble.setPosition(a.sprite.x, a.sprite.y - 62);
            continue;
          }

          // Idle wander (default between rounds).
          const dx = a.targetX - a.sprite.x;
          const dy = a.targetY - a.sprite.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 4) {
            // Pick new target
            body.setVelocity(0, 0);
            const t = this.randomWanderTarget(a.homeX, a.homeY);
            a.targetX = t.x;
            a.targetY = t.y;
            a.sprite.anims.stop();
            a.sprite.setFrame(0);
          } else {
            const moveSpeed = 30;
            body.setVelocity((dx / dist) * moveSpeed, (dy / dist) * moveSpeed);
            this.playWalk(a, dx, dy);
          }

          // Update bubble position
          a.bubble.setPosition(a.sprite.x, a.sprite.y - 36);
          if (a.actionBubble) a.actionBubble.setPosition(a.sprite.x, a.sprite.y - 62);
        }
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: parent.clientWidth,
      height: parent.clientHeight,
      parent,
      pixelArt: true,
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 } },
      },
      scene: MainScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
