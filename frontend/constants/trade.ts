// Trade labels emitted per-step by the live backend (market_live_server.py
// TRADE_LABEL) on the `description` of a persona's movement when it reaches the
// exchange. HOLD ("거래소에서 관망") intentionally maps to no bubble.

export type TradeAction = "BUY" | "SELL" | "BUY_LARGE";

export interface TradeBubble {
  action: TradeAction;
  /** Short text shown in the speech bubble above the character. */
  text: string;
  /** Accent color (border + text). CSS hex. */
  color: string;
}

const LABEL_TO_BUBBLE: Record<string, TradeBubble> = {
  "거래소에서 매수": { action: "BUY", text: "매수", color: "#2F9E44" },
  "거래소에서 대량매수": { action: "BUY_LARGE", text: "대량 매수", color: "#1F7A33" },
  "거래소에서 매도": { action: "SELL", text: "매도", color: "#C0564A" },
};

/**
 * Map a per-step movement description to its trade bubble, or null when the
 * description is not an actual trade (walking / HOLD / a daily-life stop).
 */
export function parseTradeLabel(
  desc: string | null | undefined
): TradeBubble | null {
  if (!desc) return null;
  return LABEL_TO_BUBBLE[desc] ?? null;
}
