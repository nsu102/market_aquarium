"use client";

import {
  Smile,
  Meh,
  Frown,
  Angry,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Agent } from "@/mock_data/agents";
import { AGENT_ICONS } from "@/lib/agentIcons";
import type { TradeAction } from "@/constants/trade";

interface Props {
  agents: Agent[];
  /** agent.id -> active trade alert (transient, set on a live trade). */
  alerts: Record<string, TradeAction>;
  onSelect: (agent: Agent) => void;
}

const TRADE_VIEW: Record<TradeAction, { label: string; color: string; up: boolean }> = {
  BUY: { label: "매수", color: "#78F142", up: true },
  BUY_LARGE: { label: "대량 매수", color: "#78F142", up: true },
  SELL: { label: "매도", color: "#E0827A", up: false },
};

/** Lucide face icon + color for the agent's emotion (no emoji — project rule). */
function emotionOf(agent: Agent): { Icon: LucideIcon; color: string; label: string } {
  const { fear, greed } = agent;
  if (fear >= 75) return { Icon: Angry, color: "#E0827A", label: "극도의 공포" };
  const diff = greed - fear;
  if (diff <= -20) return { Icon: Frown, color: "#E0827A", label: "공포" };
  if (diff >= 20) return { Icon: Smile, color: "#78F142", label: "탐욕" };
  return { Icon: Meh, color: "#B5BAC1", label: "중립" };
}

/**
 * Discord-style voice overlay roster (floats over the map, no panel background;
 * only each row gets a translucent black highlight pill). Row layout:
 * [profile] [[name][emotion icon] / [lastAction]]. A live trade flips the
 * status line to a trade alert (with a speaking-style ring on the avatar).
 * Clicking a row opens the agent's full detail + portfolio (AgentDetail).
 */
export default function AgentSidebar({ agents, alerts, onSelect }: Props) {
  return (
    <div className="space-y-px">
      <span className="inline-block bg-black/60 rounded-sm px-1 text-[10px] font-bold tracking-[0.16em] text-white/90">
        콜로니 — {agents.length}
      </span>
      {agents.map((agent) => {
        const Avatar = AGENT_ICONS[agent.id] || AGENT_ICONS.default;
        const alert = alerts[agent.id];
        const trade = alert ? TRADE_VIEW[alert] : null;
        const emotion = emotionOf(agent);
        const StatusIcon = trade ? (trade.up ? TrendingUp : TrendingDown) : emotion.Icon;
        const statusColor = trade ? trade.color : emotion.color;

        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            className="w-full flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer text-left"
            title={`${agent.alias} · ${agent.type}`}
          >
            <div
              className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-full border-2 shadow-[0_1px_3px_rgba(0,0,0,0.6)] ${
                trade ? "border-[#78F142] ring-2 ring-[#78F142]/50" : "border-black/40"
              }`}
              style={{ background: agent.color }}
            >
              <Avatar size={15} className="text-black" />
            </div>
            <div className="flex flex-col items-start gap-px min-w-0 leading-tight">
              {/* name + emotion icon share one tight black highlight (no box) */}
              <span className="inline-flex items-center gap-1 max-w-full bg-black/60 rounded-sm px-1 py-px">
                <span className="text-[12px] font-bold text-white truncate">{agent.alias}</span>
                <StatusIcon size={12} style={{ color: statusColor }} className="shrink-0" />
              </span>
              <span
                className="inline-block max-w-full truncate bg-black/60 rounded-sm px-1 text-[10px] font-semibold"
                style={{ color: trade ? statusColor : "#FFFFFF" }}
              >
                {trade ? trade.label : agent.lastAction}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
