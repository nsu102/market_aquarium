"use client";

/**
 * Canonical "라이브(정석)" Phaser viewer.
 *
 * Ports the reverie simulate loop (process -> update -> execute) from
 * generative_agents/nextfront/components/SimGame.tsx, adapted to the
 * market_aquarium product:
 *   - loads the_ville tilemap + per-persona character atlases from API_BASE
 *   - drives each step by sending the current tile positions (process),
 *     polling the movement JSON (update), then interpolating each persona to
 *     its target tile with directional walk animations (execute)
 *   - on every movement update, calls onTick(meta) so React can refresh the
 *     MarketPanel / BoardFeed / round indicator from meta.market/posts/round
 *
 * NO emoji are rendered on the map. reverie's `pronunciatio` may contain emoji,
 * so instead of an emoji speech bubble we draw a small text label with the
 * persona initials; the human-readable action/description flows to React.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import Phaser from "phaser";
import { Loader2, ServerCrash, Zap } from "lucide-react";
import {
  API_BASE,
  assetUrl,
  buildPersonas,
  getHome,
  initialsOf,
  isBackendNotStarted,
  processEnvironment,
  updateEnvironment,
  type GamePersona,
  type HomeResponse,
  type MovementUpdateResponse,
  type ProcessEnvironmentBody,
  type ReverieMeta,
} from "@/lib/reverieApi";

const TILE_WIDTH = 32;
const CURR_MAZE = "the_ville";
// px/frame. TILE_WIDTH must divide evenly so personas land exactly on tiles.
// 16 -> 2 frames/tile (2x faster day animation; 8 felt too slow).
const MOVEMENT_SPEED = 16;
const HOME_POLL_MS = 1200;
// While no run is active the /update poll returns not-ready (<step> === -1).
// Back off between such polls so we don't hammer the server every frame.
const UPDATE_BACKOFF_MS = 700;

export interface GameControls {
  zoomIn: () => void;
  zoomOut: () => void;
}

interface Props {
  simCode: string;
  uid?: string;
  onTick: (meta: ReverieMeta) => void;
  /** Optional ref the scene populates with zoom controls for the HUD. */
  controlsRef?: MutableRefObject<GameControls | null>;
  /** Called with a persona's original name when its sprite is clicked. */
  onSelectAgent?: (original: string) => void;
  /** Called once when a round's animation finishes (timeline drained). */
  onRoundEnd?: (round: number) => void;
}

type LoadPhase = "loading" | "ready" | "down" | "error";

export default function ReverieGame({ simCode, uid, onTick, controlsRef, onSelectAgent, onRoundEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onSelectRef = useRef(onSelectAgent);
  onSelectRef.current = onSelectAgent;
  const onRoundEndRef = useRef(onRoundEnd);
  onRoundEndRef.current = onRoundEnd;

  const personasRef = useRef<GamePersona[]>([]);
  const initialStepRef = useRef(0);
  // Mirrors `hasMovement` so the Phaser closure can guard the one-time setState.
  const hasMovementRef = useRef(false);

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Becomes true once the first real movement update streams in (after an event
  // triggers a run). Until then the agents stand idle and we show a hint.
  const [hasMovement, setHasMovement] = useState(false);

  /* ── 1. Poll /api/home until the forked sim has produced a step ── */
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Fresh sim: agents start idle again until a new event triggers movement.
    hasMovementRef.current = false;
    setHasMovement(false);

    const poll = () => {
      getHome(uid)
        .then((r) => {
          if (!alive) return;
          if (isBackendNotStarted(r)) {
            timer = setTimeout(poll, HOME_POLL_MS);
            return;
          }
          const home = r as HomeResponse;
          if (!home.persona_names?.length || !home.persona_init_pos?.length) {
            timer = setTimeout(poll, HOME_POLL_MS);
            return;
          }
          personasRef.current = buildPersonas(home);
          initialStepRef.current = home.step ?? 0;
          setPhase("ready");
        })
        .catch((e) => {
          if (!alive) return;
          setErrorMsg(e instanceof Error ? e.message : String(e));
          // Keep retrying — the data server may still be coming up.
          timer = setTimeout(poll, HOME_POLL_MS);
          setPhase((p) => (p === "ready" ? p : "loading"));
        });
    };

    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [simCode]);

  /* ── 2. Build the Phaser game once personas are ready ── */
  useEffect(() => {
    if (phase !== "ready" || !containerRef.current) return;

    const personasMeta = personasRef.current;
    const movementSpeed = MOVEMENT_SPEED;
    const executeCountMax = TILE_WIDTH / movementSpeed;

    // ---- mutable game state closed over by the scene callbacks ----
    let step = initialStepRef.current;
    let loopPhase: "process" | "update" | "execute" = "process";
    let updateInFlight = false;
    let executeMovement: MovementUpdateResponse | null = null;
    let executeCount = executeCountMax;
    // Timestamp gate: when a /update poll comes back not-ready (no run active),
    // wait UPDATE_BACKOFF_MS before re-polling instead of spamming every frame.
    let nextUpdatePollAt = 0;
    // Round-end detection: fire onRoundEnd once when a round's timeline drains.
    let lastMetaRound: number | null = null;
    let firedRoundEnd: number | null = null;

    const personaSprites: Record<string, Phaser.GameObjects.Sprite> = {};
    const labels: Record<string, Phaser.GameObjects.Text> = {};
    const movementTarget: Record<string, [number, number]> = {};
    const preAnimsDir: Record<string, string> = {};
    let animsDirection = "";

    let player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    let cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    function preload(this: Phaser.Scene) {
      this.load.crossOrigin = "anonymous";
      const A = (p: string) => assetUrl(`assets/${p}`);
      const V = "the_ville/visuals/map_assets";
      this.load.image("blocks_1", A(`${V}/blocks/blocks_1.png`));
      this.load.image("walls", A(`${V}/v1/Room_Builder_32x32.png`));
      this.load.image("interiors_pt1", A(`${V}/v1/interiors_pt1.png`));
      this.load.image("interiors_pt2", A(`${V}/v1/interiors_pt2.png`));
      this.load.image("interiors_pt3", A(`${V}/v1/interiors_pt3.png`));
      this.load.image("interiors_pt4", A(`${V}/v1/interiors_pt4.png`));
      this.load.image("interiors_pt5", A(`${V}/v1/interiors_pt5.png`));
      const C = `${V}/cute_rpg_word_VXAce/tilesets`;
      this.load.image("CuteRPG_Field_B", A(`${C}/CuteRPG_Field_B.png`));
      this.load.image("CuteRPG_Field_C", A(`${C}/CuteRPG_Field_C.png`));
      this.load.image("CuteRPG_Harbor_C", A(`${C}/CuteRPG_Harbor_C.png`));
      this.load.image("CuteRPG_Village_B", A(`${C}/CuteRPG_Village_B.png`));
      this.load.image("CuteRPG_Forest_B", A(`${C}/CuteRPG_Forest_B.png`));
      this.load.image("CuteRPG_Desert_C", A(`${C}/CuteRPG_Desert_C.png`));
      this.load.image("CuteRPG_Mountains_B", A(`${C}/CuteRPG_Mountains_B.png`));
      this.load.image("CuteRPG_Desert_B", A(`${C}/CuteRPG_Desert_B.png`));
      this.load.image("CuteRPG_Forest_C", A(`${C}/CuteRPG_Forest_C.png`));

      this.load.tilemapTiledJSON("map", A("the_ville/visuals/the_ville_jan7.json"));

      const atlasJson = A("characters/atlas.json");
      // Generic atlas used for the (invisible) camera "player" sprite.
      this.load.atlas("atlas", A("characters/Yuriko_Yamamoto.png"), atlasJson);
      // Per-persona atlases (keyed by underscore name).
      personasMeta.forEach((p) => {
        this.load.atlas(
          p.underscore,
          A(`characters/${p.underscore}.png`),
          atlasJson
        );
      });
    }

    function create(this: Phaser.Scene) {
      const map = this.make.tilemap({ key: "map" });

      const collisions = map.addTilesetImage("blocks", "blocks_1")!;
      const walls = map.addTilesetImage("Room_Builder_32x32", "walls")!;
      const interiors_pt1 = map.addTilesetImage("interiors_pt1", "interiors_pt1")!;
      const interiors_pt2 = map.addTilesetImage("interiors_pt2", "interiors_pt2")!;
      const interiors_pt3 = map.addTilesetImage("interiors_pt3", "interiors_pt3")!;
      const interiors_pt4 = map.addTilesetImage("interiors_pt4", "interiors_pt4")!;
      const interiors_pt5 = map.addTilesetImage("interiors_pt5", "interiors_pt5")!;
      const CuteRPG_Field_B = map.addTilesetImage("CuteRPG_Field_B", "CuteRPG_Field_B")!;
      const CuteRPG_Field_C = map.addTilesetImage("CuteRPG_Field_C", "CuteRPG_Field_C")!;
      const CuteRPG_Harbor_C = map.addTilesetImage("CuteRPG_Harbor_C", "CuteRPG_Harbor_C")!;
      const CuteRPG_Village_B = map.addTilesetImage("CuteRPG_Village_B", "CuteRPG_Village_B")!;
      const CuteRPG_Forest_B = map.addTilesetImage("CuteRPG_Forest_B", "CuteRPG_Forest_B")!;
      const CuteRPG_Desert_C = map.addTilesetImage("CuteRPG_Desert_C", "CuteRPG_Desert_C")!;
      const CuteRPG_Mountains_B = map.addTilesetImage("CuteRPG_Mountains_B", "CuteRPG_Mountains_B")!;
      const CuteRPG_Desert_B = map.addTilesetImage("CuteRPG_Desert_B", "CuteRPG_Desert_B")!;
      const CuteRPG_Forest_C = map.addTilesetImage("CuteRPG_Forest_C", "CuteRPG_Forest_C")!;

      const tileset_group_1 = [
        CuteRPG_Field_B, CuteRPG_Field_C, CuteRPG_Harbor_C, CuteRPG_Village_B,
        CuteRPG_Forest_B, CuteRPG_Desert_C, CuteRPG_Mountains_B, CuteRPG_Desert_B,
        CuteRPG_Forest_C, interiors_pt1, interiors_pt2, interiors_pt3,
        interiors_pt4, interiors_pt5, walls,
      ];

      map.createLayer("Bottom Ground", tileset_group_1, 0, 0);
      map.createLayer("Exterior Ground", tileset_group_1, 0, 0);
      map.createLayer("Exterior Decoration L1", tileset_group_1, 0, 0);
      map.createLayer("Exterior Decoration L2", tileset_group_1, 0, 0);
      map.createLayer("Interior Ground", tileset_group_1, 0, 0);
      map.createLayer("Wall", [CuteRPG_Field_C, walls], 0, 0);
      map.createLayer("Interior Furniture L1", tileset_group_1, 0, 0);
      // NOTE: trailing space in the layer name is intentional (matches Tiled).
      map.createLayer("Interior Furniture L2 ", tileset_group_1, 0, 0);
      const foregroundL1Layer = map.createLayer("Foreground L1", tileset_group_1, 0, 0);
      const foregroundL2Layer = map.createLayer("Foreground L2", tileset_group_1, 0, 0);
      const collisionsLayer = map.createLayer("Collisions", collisions, 0, 0);

      collisionsLayer?.setCollisionByProperty({ collide: true });
      collisionsLayer?.setDepth(-1);
      foregroundL1Layer?.setDepth(2);
      foregroundL2Layer?.setDepth(2);

      // *** CAMERA PLAYER (invisible anchor the camera follows) ***
      // Camera anchor (arrow-key drivable). Start near the market personas'
      // spawn cluster so they are on-screen, and zoom in so characters read at a
      // comfortable size (default zoom 1.0 makes the 32px sprites look tiny).
      player = this.physics.add
        .sprite(2400, 1600, "atlas", "down")
        .setSize(30, 40)
        .setOffset(0, 0);
      player.setVisible(false);
      player.setDepth(-1);
      const camera = this.cameras.main;
      camera.startFollow(player);
      camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      camera.setZoom(1.3);
      cursors = this.input.keyboard!.createCursorKeys();
      // Don't preventDefault on SPACE/arrows: capturing them would steal the
      // space bar (and arrows) from text inputs like the event-input modal.
      // Key state is still polled via isDown below, which doesn't need capture.
      this.input.keyboard!.clearCaptures();

      // *** MOUSE NAVIGATION: drag to pan, wheel to zoom ***
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown) return;
        const body = player.body as Phaser.Physics.Arcade.Body;
        const z = this.cameras.main.zoom || 1;
        body.x -= (pointer.x - pointer.prevPosition.x) / z;
        body.y -= (pointer.y - pointer.prevPosition.y) / z;
      });
      this.input.on(
        "wheel",
        (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
          const cam = this.cameras.main;
          cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.2, 2));
        }
      );

      // *** PERSONAS ***
      personasMeta.forEach((p) => {
        const name = p.underscore;
        const startPos: [number, number] = [
          p.spawn[0] * TILE_WIDTH + TILE_WIDTH / 2,
          p.spawn[1] * TILE_WIDTH + TILE_WIDTH,
        ];
        const sprite = this.physics.add
          .sprite(startPos[0], startPos[1], name, "down")
          .setSize(30, 40)
          .setOffset(0, 32);
        // Click a character to open its detail (portfolio composition, etc.).
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => onSelectRef.current?.(p.original));
        personaSprites[name] = sprite;

        // Small text label with initials (NO emoji bubble).
        labels[name] = this.add
          .text(sprite.body.x - 6, sprite.body.y - 74, p.initial || initialsOf(p.original), {
            font: "16px monospace",
            color: "#1E1A17",
            padding: { x: 6, y: 4 },
            backgroundColor: "#ffffff",
          })
          .setDepth(3);
      });

      // *** ANIMATIONS (per persona) ***
      const anims = this.anims;
      personasMeta.forEach((p) => {
        const name = p.underscore;
        const mk = (dir: string) =>
          anims.create({
            key: `${name}-${dir}-walk`,
            frames: anims.generateFrameNames(name, {
              prefix: `${dir}-walk.`,
              start: 0,
              end: 3,
              zeroPad: 3,
            }),
            frameRate: 4,
            repeat: -1,
          });
        mk("left");
        mk("right");
        mk("down");
        mk("up");
      });

      // Expose zoom controls to the HUD.
      if (controlsRef) {
        controlsRef.current = {
          zoomIn: () =>
            camera.setZoom(Phaser.Math.Clamp(camera.zoom + 0.15, 0.2, 2)),
          zoomOut: () =>
            camera.setZoom(Phaser.Math.Clamp(camera.zoom - 0.15, 0.2, 2)),
        };
      }
    }

    function setLabel(under: string, original: string) {
      labels[under]?.setText(initialsOf(original));
    }

    // Moves one persona one frame toward its target.
    function stepPersona(under: string) {
      const sprite = personaSprites[under];
      if (!sprite) return;
      const target = movementTarget[under];
      if (!target) return;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      if (body.x < target[0]) {
        body.x += movementSpeed;
        animsDirection = "r";
        preAnimsDir[under] = "r";
      } else if (body.x > target[0]) {
        body.x -= movementSpeed;
        animsDirection = "l";
        preAnimsDir[under] = "l";
      } else if (body.y < target[1]) {
        body.y += movementSpeed;
        animsDirection = "d";
        preAnimsDir[under] = "d";
      } else if (body.y > target[1]) {
        body.y -= movementSpeed;
        animsDirection = "u";
        preAnimsDir[under] = "u";
      } else {
        animsDirection = "";
      }

      const label = labels[under];
      if (label) {
        label.x = body.x - 6;
        label.y = body.y - 74;
      }

      if (animsDirection === "l") sprite.anims.play(`${under}-left-walk`, true);
      else if (animsDirection === "r") sprite.anims.play(`${under}-right-walk`, true);
      else if (animsDirection === "u") sprite.anims.play(`${under}-up-walk`, true);
      else if (animsDirection === "d") sprite.anims.play(`${under}-down-walk`, true);
      else {
        sprite.anims.stop();
        const d = preAnimsDir[under];
        if (d === "l") sprite.setTexture(under, "left");
        else if (d === "r") sprite.setTexture(under, "right");
        else if (d === "u") sprite.setTexture(under, "up");
        else if (d === "d") sprite.setTexture(under, "down");
      }
    }

    function moveCamera() {
      const cameraSpeed = 400;
      const body = player.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0);
      if (cursors.left.isDown) body.setVelocityX(-cameraSpeed);
      if (cursors.right.isDown) body.setVelocityX(cameraSpeed);
      if (cursors.up.isDown) body.setVelocityY(-cameraSpeed);
      if (cursors.down.isDown) body.setVelocityY(cameraSpeed);
    }

    // ---- simulate loop: process -> update -> execute ----
    function updateSim() {
      if (loopPhase === "process") {
        const env: ProcessEnvironmentBody["environment"] = {};
        personasMeta.forEach((p) => {
          const body = personaSprites[p.underscore].body as Phaser.Physics.Arcade.Body;
          env[p.original] = {
            maze: CURR_MAZE,
            x: Math.ceil(body.position.x / TILE_WIDTH),
            y: Math.ceil(body.position.y / TILE_WIDTH),
          };
        });
        processEnvironment({ step, sim_code: simCode, environment: env }).catch(
          () => undefined
        );
        loopPhase = "update";
        return;
      }

      if (loopPhase === "update") {
        // One poll in flight at a time; back off after a not-ready response so
        // we don't spam the server while no run is active (agents stay idle).
        if (updateInFlight || Date.now() < nextUpdatePollAt) return;
        updateInFlight = true;
        updateEnvironment(step, simCode, uid)
          .then((resp) => {
            if (resp["<step>"] === step) {
              // Movement for this step is ready — animate it.
              executeMovement = resp;
              loopPhase = "execute";
              if (!hasMovementRef.current) {
                hasMovementRef.current = true;
                setHasMovement(true);
              }
            } else {
              // Not ready (e.g. <step> === -1): no run active yet. Stay idle and
              // re-poll quietly after a short backoff. No throw, no console spam.
              nextUpdatePollAt = Date.now() + UPDATE_BACKOFF_MS;
              // The round's timeline just drained -> the day ended. Fire once.
              if (
                hasMovementRef.current &&
                lastMetaRound != null &&
                firedRoundEnd !== lastMetaRound
              ) {
                firedRoundEnd = lastMetaRound;
                onRoundEndRef.current?.(lastMetaRound);
              }
            }
          })
          .catch(() => {
            // Transient error (server warming up): back off and retry quietly.
            nextUpdatePollAt = Date.now() + UPDATE_BACKOFF_MS;
          })
          .finally(() => {
            updateInFlight = false;
          });
        return;
      }

      {
        // execute
        personasMeta.forEach((p) => {
          const under = p.underscore;
          const unit = executeMovement?.persona?.[p.original];
          if (executeCount === executeCountMax && unit) {
            const [cx, cy] = unit.movement;
            movementTarget[under] = [cx * TILE_WIDTH, cy * TILE_WIDTH];
            setLabel(under, p.original);
          }
          if (executeCount > 0) {
            stepPersona(under);
          }
        });

        // Emit the round meta once per step (market / posts / round).
        if (executeCount === executeCountMax) {
          const meta = executeMovement?.meta;
          if (meta) {
            onTickRef.current?.(meta);
            if (typeof meta.round === "number") lastMetaRound = meta.round;
          }
        }

        if (executeCount <= 0) {
          personasMeta.forEach((p) => {
            const body = personaSprites[p.underscore].body as Phaser.Physics.Arcade.Body;
            const t = movementTarget[p.underscore];
            if (t) {
              body.x = t[0];
              body.y = t[1];
            }
          });
          loopPhase = "process";
          executeCount = executeCountMax + 1;
          step = step + 1;
        }
        executeCount = executeCount - 1;
      }
    }

    function update(this: Phaser.Scene) {
      moveCamera();
      updateSim();
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current || undefined,
      pixelArt: true,
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: { preload, create, update },
    };

    const game = new Phaser.Game(config);

    return () => {
      if (controlsRef) controlsRef.current = null;
      game.destroy(true);
    };
  }, [phase, simCode, controlsRef]);

  /* ── Render ── */
  if (phase === "ready") {
    // Map + idle agents render immediately. The hint is a small non-blocking
    // overlay shown only until the first movement starts flowing (post-event).
    return (
      <div className="relative h-full w-full">
        <div ref={containerRef} className="h-full w-full" />
        {!hasMovement && (
          <div className="pointer-events-none absolute left-1/2 bottom-6 -translate-x-1/2 z-10">
            <div className="flex items-center gap-2 rounded-full bg-surface-card/90 border border-border-light px-4 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.12)] backdrop-blur-sm">
              <Zap size={15} className="text-accent-blue" />
              <span className="text-[12px] font-medium text-text-secondary">
                이벤트를 입력하면 에이전트가 움직입니다
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-surface-primary text-text-secondary gap-3">
      {phase === "error" ? (
        <>
          <ServerCrash size={28} className="text-accent-red" />
          <div className="text-sm font-semibold text-text-primary">
            라이브 시뮬레이션 서버에 연결할 수 없습니다
          </div>
          <div className="text-[11px] text-text-tertiary max-w-[420px] text-center leading-relaxed">
            api_server({API_BASE}) 가 실행 중인지 확인하세요. {errorMsg}
          </div>
        </>
      ) : (
        <>
          <Loader2 size={26} className="text-accent-blue animate-spin" />
          <div className="text-sm font-medium">시뮬레이션을 준비하는 중…</div>
          <div className="text-[11px] text-text-tertiary">
            맵과 에이전트를 불러오는 중입니다.
          </div>
        </>
      )}
    </div>
  );
}
