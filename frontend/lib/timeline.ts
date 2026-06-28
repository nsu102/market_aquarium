/**
 * Round timer (00:00 → 24:00) replay helpers.
 *
 * A round is computed in full on the backend, which also returns a SCENARIO: a
 * time-ordered list of actions (post / comment / like / dislike), each stamped
 * with a minute t in [0, 1440]. The frontend plays this back over ~2 real
 * minutes, so the board fills in sequentially instead of all at once.
 *
 * These are PURE functions of (roundData, t) so the page can recompute the
 * visible board + interpolated market on every timer tick with no side effects.
 */

import { MarketData } from "@/mock_data/market";
import { Post, Comment } from "@/mock_data/posts";
import { Agent } from "@/mock_data/agents";
import { GameEvent } from "@/mock_data/events";
import type { RoundReportMeta } from "@/lib/reverieApi";

export const ROUND_MINUTES = 1440; // 00:00 → 24:00
export const ROUND_REAL_MS = 120_000; // played over ~2 real minutes

export type ActionKind = "post" | "comment" | "like" | "dislike";

export interface ScenarioAction {
  t: number; // minute in [0, 1440]
  kind: ActionKind;
  post_id: string;
  comment_id: string | null;
}

export interface Scenario {
  round: number;
  duration_min: number;
  actions: ScenarioAction[];
}

/** Everything the timer needs to replay one round. */
export interface RoundData {
  round: number;
  posts: Post[]; // full posts (all comments + final vote counts)
  scenario: Scenario | null;
  agents: Agent[];
  snsAgents: Agent[];
  emotionDeltas: Record<string, Record<string, number>>;
  events: GameEvent[];
  startMarket: MarketData | null;
  finalMarket: MarketData | null;
  roundReport: RoundReportMeta | null;
  finished: boolean;
}

/** "0830" minutes -> "08:30" clock label. */
export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.min(ROUND_MINUTES, Math.round(minutes)));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  // 1440 reads as 24:00 (end of day) rather than 24:00 -> 00:00 wrap.
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

interface ScenarioIndex {
  postT: Map<string, number>;
  commentT: Map<string, number>;
  futureLike: Map<string, number>;
  futureDislike: Map<string, number>;
}

const voteKey = (postId: string, commentId: string | null) =>
  commentId ? `c:${commentId}` : `p:${postId}`;

/** Pre-index a scenario for a given time t (votes still in the future). */
function indexScenario(scenario: Scenario | null, t: number): ScenarioIndex {
  const idx: ScenarioIndex = {
    postT: new Map(),
    commentT: new Map(),
    futureLike: new Map(),
    futureDislike: new Map(),
  };
  for (const a of scenario?.actions ?? []) {
    if (a.kind === "post") idx.postT.set(a.post_id, a.t);
    else if (a.kind === "comment" && a.comment_id) idx.commentT.set(a.comment_id, a.t);
    else if (a.t > t && (a.kind === "like" || a.kind === "dislike")) {
      const key = voteKey(a.post_id, a.comment_id);
      const m = a.kind === "like" ? idx.futureLike : idx.futureDislike;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  return idx;
}

/**
 * The board as it should look at minute t: current-round posts/comments appear
 * only once their scheduled time has passed, and vote counts ramp up by
 * SUBTRACTING the votes still scheduled in the future from the stored final
 * count. Prior-round and user-authored content is always shown in full.
 */
export function visiblePosts(rd: RoundData, t: number): Post[] {
  const rnd = rd.round;
  const idx = indexScenario(rd.scenario, t);

  const postVisible = (p: Post) =>
    p.round < rnd || p.is_user || (idx.postT.has(p.id) ? idx.postT.get(p.id)! <= t : true);

  const commentVisible = (c: Comment) =>
    (c.round ?? rnd) < rnd ||
    c.is_user ||
    (c.id && idx.commentT.has(c.id) ? idx.commentT.get(c.id)! <= t : true);

  const out: Post[] = [];
  for (const p of rd.posts) {
    if (!postVisible(p)) continue;
    const pk = voteKey(p.id, null);
    out.push({
      ...p,
      likes: Math.max(0, p.likes - (idx.futureLike.get(pk) ?? 0)),
      dislikes: Math.max(0, (p.dislikes ?? 0) - (idx.futureDislike.get(pk) ?? 0)),
      comments: p.comments.filter(commentVisible).map((c) => {
        const ck = voteKey(p.id, c.id ?? null);
        return {
          ...c,
          likes: Math.max(0, (c.likes ?? 0) - (idx.futureLike.get(ck) ?? 0)),
          dislikes: Math.max(0, (c.dislikes ?? 0) - (idx.futureDislike.get(ck) ?? 0)),
        };
      }),
    });
  }
  return out;
}

/** Linearly interpolate the market (indices + per-asset prices) start → final. */
export function interpMarket(rd: RoundData, t: number): MarketData | null {
  const fm = rd.finalMarket;
  if (!fm) return null;
  const sm = rd.startMarket;
  if (!sm) return fm;
  const f = Math.max(0, Math.min(1, t / (rd.scenario?.duration_min || ROUND_MINUTES)));
  const lerp = (a: number, b: number) => a + (b - a) * f;

  const startPrice = new Map(sm.assets.map((a) => [a.symbol, a.price]));
  const startSent = new Map(sm.sentimentContribution.map((s) => [s.agent, s.value]));

  return {
    ...fm,
    fearGreedIndex: lerp(sm.fearGreedIndex, fm.fearGreedIndex),
    rumorSpeed: lerp(sm.rumorSpeed, fm.rumorSpeed),
    panicSellRatio: lerp(sm.panicSellRatio, fm.panicSellRatio),
    fomoBuyRatio: lerp(sm.fomoBuyRatio, fm.fomoBuyRatio),
    whaleBuyIntensity: lerp(sm.whaleBuyIntensity, fm.whaleBuyIntensity),
    whaleSellIntensity: lerp(sm.whaleSellIntensity, fm.whaleSellIntensity),
    assets: fm.assets.map((a) => {
      const sp = startPrice.get(a.symbol) ?? a.price;
      const price = lerp(sp, a.price);
      return { ...a, price, change24h: sp ? (price / sp - 1) * 100 : a.change24h };
    }),
    sentimentContribution: fm.sentimentContribution.map((s) => ({
      ...s,
      value: lerp(startSent.get(s.agent) ?? s.value, s.value),
    })),
  };
}
