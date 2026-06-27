/**
 * Typed client for the reverie *data* server (api_server, default port 8000).
 *
 * Powers the canonical "라이브(정석)" mode: it serves the home metadata
 * (personas + spawn positions), receives the per-step environment (process),
 * and returns the movement JSON for each step (update). Static game assets
 * (the_ville tilemap, character atlases) are also served from this origin, so
 * asset URLs are absolute against API_BASE to keep Phaser and fetch in sync.
 *
 * The per-step movement payload's `meta.market` / `meta.posts` shapes are
 * aligned with the market_aquarium frontend types and reused directly.
 */

import { MarketData } from "@/mock_data/market";
import { Post } from "@/mock_data/posts";
import { GameEvent } from "@/mock_data/events";

// Live mode uses ONE merged backend (live_server) serving both /api/* and
// /control/* on the same port (default :8000).
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000";

/** Absolute URL for a static asset served by api_server (e.g. "assets/..."). */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${API_BASE}/${clean}`;
}

/* ── Types ── */

export interface PersonaName {
  original: string; // "Jane Moreno"
  underscore: string; // "Jane_Moreno"
  initial: string; // "JM"
}

export interface HomeResponse {
  sim_code: string;
  step: number;
  persona_names: PersonaName[];
  // Each entry is [persona_name_with_spaces, tileX, tileY].
  persona_init_pos: [string, number, number][];
}

export interface BackendNotStarted {
  error: "backend_not_started";
}

export type HomeResult = HomeResponse | BackendNotStarted;

export function isBackendNotStarted(r: HomeResult): r is BackendNotStarted {
  return (r as BackendNotStarted).error === "backend_not_started";
}

export interface EnvironmentTile {
  maze: string;
  x: number;
  y: number;
}

export interface ProcessEnvironmentBody {
  step: number;
  sim_code: string;
  environment: Record<string, EnvironmentTile>;
}

/** One persona's movement for a single step. */
export interface MovementUnit {
  movement: [number, number]; // [tileX, tileY]
  pronunciatio: string; // may contain emoji — NOT rendered as a bubble
  description: string; // "writing @ the ville:...:desk"
  chat: [string, string][] | null;
}

/** Round-level metadata carried alongside each movement update. */
export interface ReverieMeta {
  curr_time?: string;
  market?: MarketData;
  posts?: Post[];
  events?: GameEvent[];
  round?: number;
}

export interface MovementUpdateResponse {
  // Echoes the step the movement file corresponds to, or -1 if not ready.
  "<step>": number;
  persona?: Record<string, MovementUnit>;
  meta?: ReverieMeta;
}

/** Persona handed to the Phaser scene. */
export interface GamePersona {
  original: string; // spaces
  underscore: string;
  initial: string;
  spawn: [number, number]; // tile coords
}

/* ── Request helpers ── */

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path} 실패: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`POST ${path} 실패: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/* ── Endpoints ── */

export function getHome(): Promise<HomeResult> {
  return getJson<HomeResult>("/api/home");
}

export function processEnvironment(
  body: ProcessEnvironmentBody
): Promise<{ status: string }> {
  return postJson<{ status: string }>("/api/environment/process", body);
}

export function updateEnvironment(
  step: number,
  simCode: string
): Promise<MovementUpdateResponse> {
  return postJson<MovementUpdateResponse>("/api/environment/update", {
    step,
    sim_code: simCode,
  });
}

/* ── Name helpers (ported from the reverie templates) ── */

// "Jane Moreno" -> "JM"
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

export const toUnderscore = (name: string) => name.replace(/ /g, "_");
export const toSpaces = (name: string) => name.replace(/_/g, " ");

/** Build the normalized persona list the Phaser scene needs from home data. */
export function buildPersonas(home: HomeResponse): GamePersona[] {
  const posByOriginal = new Map<string, [number, number]>();
  for (const [name, x, y] of home.persona_init_pos) {
    posByOriginal.set(name, [x, y]);
  }
  return home.persona_names.map((p) => ({
    original: p.original,
    underscore: p.underscore,
    initial: p.initial || initialsOf(p.original),
    spawn: posByOriginal.get(p.original) ?? [0, 0],
  }));
}
