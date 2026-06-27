/**
 * Typed client for the reverie *control* server (default port 8001).
 *
 * This server drives the reverie ReverieServer instance (fork / run / inject
 * market events) so the browser can start a canonical "라이브(정석)" simulation
 * without touching the backend terminal.
 *
 * Base URL comes from NEXT_PUBLIC_CONTROL_BASE (default http://127.0.0.1:8001).
 * The market_aquarium MarketData / Post / Agent / GameEvent shapes are reused
 * directly because the control server's JSON is aligned with them.
 */

import { Agent } from "@/mock_data/agents";
import { MarketData } from "@/mock_data/market";
import { Post } from "@/mock_data/posts";
import { GameEvent } from "@/mock_data/events";

export const CONTROL_BASE =
  process.env.NEXT_PUBLIC_CONTROL_BASE?.replace(/\/$/, "") ||
  "http://127.0.0.1:8001";

/* ── Response shapes ── */

export interface ControlStatus {
  loaded: boolean;
  sim_code: string | null;
  step: number | null;
  curr_time: string | null;
  running_steps: boolean;
  // The control server may surface additional fields; keep them optional.
  fork_sim_code?: string | null;
  last_output?: string;
  error?: string | null;
}

export interface StartResponse {
  status?: string;
  sim_code: string;
  step: number;
}

export interface RunResponse {
  status?: string;
  count: number;
}

/** Impact may arrive as a signed number or a label depending on the engine. */
export type MarketImpact = number | "positive" | "negative" | "neutral" | string;

export interface MarketEventResponse {
  round: number;
  event: string;
  impact: MarketImpact;
}

export interface MarketStateResponse {
  ready: boolean;
  round: number;
  agents: Agent[];
  market: MarketData;
  posts: Post[];
  events: GameEvent[];
  sectors: string[];
}

export interface MarketEventInput {
  text: string;
  is_rumor?: boolean;
}

/* ── Core request helper ── */

interface ErrorBody {
  error?: string;
  detail?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CONTROL_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    // Connection refused (control server not running) — let callers fall back.
    throw new Error(
      `컨트롤 서버에 연결할 수 없습니다 (${CONTROL_BASE}): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = data as ErrorBody | null;
    const msg =
      body?.error ||
      body?.detail ||
      `${path} 실패: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data as T;
}

function getJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

/* ── Endpoints ── */

export function getStatus(): Promise<ControlStatus> {
  return getJson<ControlStatus>("/control/status");
}

/** Fork `fork_sim_code` into a fresh `sim_code` and load it. */
export function start(
  fork_sim_code: string,
  sim_code: string
): Promise<StartResponse> {
  return postJson<StartResponse>("/control/start", { fork_sim_code, sim_code });
}

/** Run N steps in the background; the simulator drives them via process/update. */
export function run(count: number): Promise<RunResponse> {
  return postJson<RunResponse>("/control/run", { count });
}

/** Inject the round's global event (FR-1). */
export function marketEvent(
  input: MarketEventInput
): Promise<MarketEventResponse> {
  return postJson<MarketEventResponse>("/control/market/event", {
    text: input.text,
    is_rumor: input.is_rumor ?? false,
  });
}

/** Snapshot of the current market state (ready=false before the sim starts). */
export function marketState(): Promise<MarketStateResponse> {
  return getJson<MarketStateResponse>("/control/market/state");
}
