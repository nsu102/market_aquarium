"use client";

import {
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Agent } from "@/mock_data/agents";
import { AGENT_ICONS } from "@/lib/agentIcons";
import { getProfileImg } from "@/lib/profileImg";
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

/** Emotion image path based on fear/greed balance. */
function emotionImg(agent: Agent): string {
  const { fear, greed } = agent;
  const diff = greed - fear;
  if (fear >= 75 || diff <= -20) return "/assets/mad.png";
  if (diff >= 20) return "/assets/happy.png";
  return "/assets/normal.png";
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
    <div className="space-y-1.5">
      <span className="inline-block bg-black/60 rounded px-1.5 text-[11px] font-bold tracking-[0.16em] text-white/90">
        콜로니 — {agents.length}
      </span>
      {agents.map((agent) => {
        const Avatar = AGENT_ICONS[agent.id] || AGENT_ICONS.default;
        const alert = alerts[agent.id];
        const trade = alert ? TRADE_VIEW[alert] : null;
        const emImg = emotionImg(agent);
        const StatusIcon = trade ? (trade.up ? TrendingUp : TrendingDown) : null;
        const statusColor = trade?.color;

        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            className="w-full flex items-center gap-2.5 px-1 py-1 rounded cursor-pointer text-left"
            title={`${agent.alias} · ${agent.type}`}
          >
            <div
              className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-full border-2 shadow-[0_1px_3px_rgba(0,0,0,0.6)] overflow-hidden ${
                trade ? "border-[#78F142] ring-2 ring-[#78F142]/50" : "border-black/40"
              }`}
              style={{ background: agent.color }}
            >
              {getProfileImg(agent.id) ? (
                <img src={getProfileImg(agent.id)!} alt={agent.alias} className="w-full h-full object-cover" />
              ) : (
                <Avatar size={22} className="text-black" />
              )}
            </div>
            <div className="flex flex-col items-start gap-1 min-w-0 leading-tight">
              {/* name + emotion icon share one tight black highlight (no box) */}
              <span className="inline-flex items-center gap-1.5 max-w-full bg-black/60 rounded px-1.5 py-0.5">
                <span className="text-[14px] font-bold text-white truncate">{agent.alias}</span>
                {StatusIcon ? (
                  <StatusIcon size={15} style={{ color: statusColor }} className="shrink-0" />
                ) : (
                  <img src={emImg} alt="" width={22} height={22} className="shrink-0" />
                )}
              </span>
              <span
                className="inline-block max-w-full truncate bg-black/60 rounded px-1.5 py-0.5 text-[12px] font-semibold"
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
