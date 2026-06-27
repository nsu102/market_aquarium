"use client";

import { useEffect, useRef, useImperativeHandle, ForwardedRef } from "react";
import Phaser from "phaser";
import { Agent } from "@/mock_data/agents";
import { AquariumMapHandle } from "./AquariumMap";

interface Props {
  agents: Agent[];
  onSelectAgent: (a: Agent) => void;
  mapRef?: ForwardedRef<AquariumMapHandle>;
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
      agentSprites: { sprite: Phaser.GameObjects.Sprite; bubble: Phaser.GameObjects.Container; agent: Agent; homeX: number; homeY: number; targetX: number; targetY: number }[] = [];

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

        // Character atlas from CDN (misa)
        this.load.atlas(
          "atlas",
          "https://mikewesthad.github.io/phaser-3-tilemap-blog-posts/post-1/assets/atlas/atlas.png",
          "https://mikewesthad.github.io/phaser-3-tilemap-blog-posts/post-1/assets/atlas/atlas.json"
        );
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

        for (const name of layerNames) {
          const layer = map.createLayer(name, tilesets);
          if (layer && name === "Collisions") {
            layer.setVisible(false);
          }
        }

        // Create walk animations from misa atlas
        const anims = this.anims;
        const directions = ["left", "right", "front", "back"];
        for (const dir of directions) {
          const walkKey = `misa-${dir}-walk`;
          if (!anims.exists(walkKey)) {
            anims.create({
              key: walkKey,
              frames: anims.generateFrameNames("atlas", {
                prefix: `misa-${dir}-walk.`,
                start: 0,
                end: 3,
                zeroPad: 3,
              }),
              frameRate: 6,
              repeat: -1,
            });
          }
        }

        // Place agents
        const currentAgents = agentsRef.current;
        let fallbackIdx = 0;
        for (const agent of currentAgents) {
          let pos = SPAWN_POSITIONS[agent.id];
          if (!pos) {
            pos = FALLBACK_SPAWNS[fallbackIdx % FALLBACK_SPAWNS.length];
            fallbackIdx++;
          }
          const sprite = this.physics.add.sprite(pos.x, pos.y, "atlas", "misa-front");
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

          this.agentSprites.push({ sprite, bubble: bubbleContainer, agent, homeX, homeY, targetX, targetY });
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

      update(_time: number, _delta: number) {
        const cam = this.cameras.main;
        const speed = 8;

        if (this.cursors.left.isDown) cam.scrollX -= speed;
        if (this.cursors.right.isDown) cam.scrollX += speed;
        if (this.cursors.up.isDown) cam.scrollY -= speed;
        if (this.cursors.down.isDown) cam.scrollY += speed;

        // Idle wander for agents
        for (const a of this.agentSprites) {
          const body = a.sprite.body as Phaser.Physics.Arcade.Body;
          const dx = a.targetX - a.sprite.x;
          const dy = a.targetY - a.sprite.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 4) {
            // Pick new target
            body.setVelocity(0, 0);
            a.targetX = a.homeX + (Math.random() - 0.5) * WANDER_RADIUS * 2;
            a.targetY = a.homeY + (Math.random() - 0.5) * WANDER_RADIUS * 2;
            a.sprite.anims.stop();
            a.sprite.setFrame("misa-front");
          } else {
            const moveSpeed = 30;
            const vx = (dx / dist) * moveSpeed;
            const vy = (dy / dist) * moveSpeed;
            body.setVelocity(vx, vy);

            if (Math.abs(dx) > Math.abs(dy)) {
              a.sprite.anims.play(dx < 0 ? "misa-left-walk" : "misa-right-walk", true);
            } else {
              a.sprite.anims.play(dy < 0 ? "misa-back-walk" : "misa-front-walk", true);
            }
          }

          // Update bubble position
          a.bubble.setPosition(a.sprite.x, a.sprite.y - 36);
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
