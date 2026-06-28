/**
 * Event card model (mirrors backend sim/cards.py Card) + presentation helpers.
 * Cards replace the free-text event: the player picks a card (cascading
 * locks/unlocks) or uses the single free-text wildcard. No emoji — lucide icons.
 */
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Flame,
  Radio,
  ShieldCheck,
  Landmark,
  Users,
  Repeat,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type EventImpact = "positive" | "negative" | "neutral";

export interface EventCard {
  id: string;
  title: string;
  text: string;
  impact: EventImpact;
  is_rumor: boolean;
  base_shock: number;
  rounds: number[];
  tags: string[];
  locks: string[];
  unlocks: string[];
}

/** Pixel palette accent by impact (aligned with EventOverlay). */
export function cardAccent(impact: EventImpact): string {
  if (impact === "negative") return "#C0564A";
  if (impact === "positive") return "#78F142";
  return "#FFE87C";
}

export function impactLabel(impact: EventImpact): string {
  if (impact === "negative") return "악재";
  if (impact === "positive") return "호재";
  return "중립";
}

// First matching tag wins; falls back to impact-flavoured default.
const TAG_ICON: Record<string, LucideIcon> = {
  panic: TrendingDown,
  fear: AlertTriangle,
  rumor: Radio,
  macro: Landmark,
  euphoria: TrendingUp,
  greed: TrendingUp,
  hype: Flame,
  herd: Users,
  reversal: Repeat,
  calm: ShieldCheck,
  recovery: ShieldCheck,
  contrarian: ShieldCheck,
};

export function cardIcon(card: EventCard): LucideIcon {
  for (const tag of card.tags) {
    if (TAG_ICON[tag]) return TAG_ICON[tag];
  }
  return card.impact === "negative"
    ? AlertTriangle
    : card.impact === "positive"
    ? TrendingUp
    : Zap;
}
