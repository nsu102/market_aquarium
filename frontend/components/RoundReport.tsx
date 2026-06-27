"use client";

import { useState } from "react";
import { RoundReport as RoundReportType } from "@/mock_data/rounds";
import { GameEvent } from "@/mock_data/events";
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Zap,
  Users,
} from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";

function formatKRW(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return n.toLocaleString();
}

export default function RoundReport({
  report,
  events,
}: {
  report: RoundReportType;
  events: GameEvent[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-surface-card border-t border-border transition-all duration-300 flex-shrink-0 ${
        expanded ? "h-56" : "h-11"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full h-11 flex items-center px-5 gap-3 hover:bg-surface-secondary/50 transition cursor-pointer"
      >
        <span className="text-[11px] text-text-secondary flex items-center gap-1.5 font-medium">
          <Zap size={12} className="text-accent-gold" />
          라운드 {report.round} 리포트
        </span>
        <span className="text-[11px] text-text-tertiary flex-1 truncate text-left">
          {report.summary}
        </span>
        {expanded ? (
          <ChevronDown size={14} className="text-text-tertiary" />
        ) : (
          <ChevronUp size={14} className="text-text-tertiary" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-3 flex gap-8 overflow-x-auto text-[11px]">
          {/* Price changes */}
          <div className="min-w-[180px]">
            <div className="text-text-tertiary mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-semibold">
              <TrendingUp size={11} className="text-accent-blue" />
              시세 변동
            </div>
            {report.priceChanges.map((p) => {
              const diff = p.after - p.before;
              const isUp = diff >= 0;
              return (
                <div
                  key={p.asset}
                  className="flex items-center gap-2 text-text-secondary py-1"
                >
                  <span className="font-semibold text-text-primary w-8">
                    {p.asset}
                  </span>
                  <span className="font-mono">
                    {formatKRW(p.before)} → {formatKRW(p.after)}
                  </span>
                  <span
                    className="font-mono flex items-center gap-0.5 font-medium"
                    style={{ color: isUp ? "#5B8C3E" : "#C85A4A" }}
                  >
                    {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {isUp ? "+" : ""}
                    {((diff / p.before) * 100).toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Agent actions */}
          <div className="min-w-[200px]">
            <div className="text-text-tertiary mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-semibold">
              <Users size={11} className="text-accent-green" />
              에이전트 행동
            </div>
            {report.agentActions.map((a, i) => {
              const Icon = AGENT_ICONS[a.agentAlias] || AGENT_ICONS.default;
              return (
                <div
                  key={i}
                  className="text-text-secondary flex items-center gap-1.5 py-1"
                >
                  <Icon size={12} className="text-text-tertiary" />
                  <span className="text-text-primary font-medium">{a.agentAlias}:</span>
                  <span>{a.action}</span>
                </div>
              );
            })}
          </div>

          {/* Events */}
          <div className="min-w-[220px]">
            <div className="text-text-tertiary mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-semibold">
              <Zap size={11} className="text-accent-gold" />
              주요 이벤트
            </div>
            <div className="text-accent-orange font-semibold mb-1.5">
              {report.keyEvent}
            </div>
            {events.map((e) => (
              <div key={e.id} className="text-text-tertiary py-0.5">
                <span
                  className={`text-[10px] font-mono mr-1.5 font-semibold ${
                    e.source === "user" ? "text-accent-blue" : "text-text-tertiary"
                  }`}
                >
                  [{e.source === "user" ? "USER" : "SYS"}]
                </span>
                <span className="text-text-secondary">{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
