/**
 * Market Aquarium simulation API client.
 *
 * Talks to the backend simulation server. The backend response shapes were
 * deliberately designed to match the frontend mock_data types, so the existing
 * Agent / Asset / MarketData / Post / GameEvent interfaces are reused directly
 * instead of being duplicated here.
 */

import { Agent } from "@/mock_data/agents";
import { MarketData } from "@/mock_data/market";
import { Post } from "@/mock_data/posts";
import { GameEvent } from "@/mock_data/events";

/* ── Base URL ── */

export const SIM_API_BASE =
  process.env.NEXT_PUBLIC_SIM_API ?? "http://127.0.0.1:8100";

/* ── Types ── */

export interface HealthResponse {
  status: string;
  max_rounds: number;
  game_active: boolean;
}

export interface AssetsResponse {
  assets: MarketData["assets"];
  sectors: string[];
}

export interface GameState {
  round: number;
  max_rounds: number;
  finished: boolean;
  agents: Agent[];
  market: MarketData;
  posts: Post[];
  events: GameEvent[];
  sectors: string[];
}

export interface PriceBreakdown {
  [key: string]: unknown;
}

export interface RoundReportData {
  round: number;
  fearGreedIndex: number;
  panicSellRatio: number;
  fomoBuyRatio: number;
  emotion_contribution_share: number;
  markdown: string;
  price_breakdowns: PriceBreakdown[];
}

export type TradeAction = "BUY" | "SELL" | "HOLD" | "BUY_LARGE";

/**
 * Per-agent summary of what each agent did this round. Drives the map movement
 * choreography (walk to board if posted, walk to exchange if traded).
 */
export interface RoundAction {
  agent_id: string;
  alias: string;
  posted: boolean;
  post_text: string | null;
  trade_action: TradeAction;
  trade_symbol: string | null;
  traded: boolean;
}

export interface EventResponse extends GameState {
  round_report: RoundReportData;
  round_actions: RoundAction[];
}

export interface Achievement {
  agent_id: string;
  title: string;
  description: string;
}

export interface OverallReport {
  rounds: RoundReportData[];
  achievements: Achievement[];
  markdown: string;
}

export interface SubmitEventInput {
  text: string;
  source?: string;
  is_rumor?: boolean;
  cred_source?: string | null;
}

/* ── Error ── */

export class SimApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SimApiError";
    this.status = status;
  }
}

/* ── Core request helper ── */

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SIM_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    // Network / connection failure (backend offline, CORS, etc.)
    throw new SimApiError(
      `시뮬레이션 서버에 연결할 수 없습니다: ${
        err instanceof Error ? err.message : String(err)
      }`,
      0
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = (body && (body.detail || body.message)) || detail;
    } catch {
      /* ignore body parse errors */
    }
    throw new SimApiError(`API ${path} 실패 (${res.status}): ${detail}`, res.status);
  }

  return (await res.json()) as T;
}

/* ── Public surface ── */

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

export function getAssets(): Promise<AssetsResponse> {
  return request<AssetsResponse>("/api/assets");
}

export function startGame(numAgents: number, seed: number = 42): Promise<GameState> {
  return request<GameState>("/api/game/start", {
    method: "POST",
    body: JSON.stringify({ num_agents: numAgents, seed }),
  });
}

export function getState(): Promise<GameState> {
  return request<GameState>("/api/game/state");
}

export function submitEvent(input: SubmitEventInput): Promise<EventResponse> {
  return request<EventResponse>("/api/game/event", {
    method: "POST",
    body: JSON.stringify({
      text: input.text,
      source: input.source ?? "user",
      is_rumor: input.is_rumor ?? false,
      cred_source: input.cred_source ?? null,
    }),
  });
}

export function getReport(): Promise<OverallReport> {
  return request<OverallReport>("/api/game/report");
}
