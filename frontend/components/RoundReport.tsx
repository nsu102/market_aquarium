"use client";

import { RoundReport as RoundReportType } from "@/mock_data/rounds";
import { GameEvent } from "@/mock_data/events";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Users,
  X,
  FileText,
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
  onClose,
}: {
  report: RoundReportType;
  events: GameEvent[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-[640px] max-w-[90vw] max-h-[80vh] bg-surface-card border border-border-light rounded-2xl shadow-[0_12px_60px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col animate-slide-up">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-light flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-accent-gold" />
              <span className="text-[13px] font-bold text-text-primary">
                라운드 {report.round} 리포트
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Summary */}
          <div className="px-5 py-3 bg-surface-secondary/40 border-b border-border-light">
            <p className="text-[12px] text-text-secondary leading-relaxed">{report.summary}</p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

              {/* Price changes */}
              <div>
                <div className="text-text-tertiary mb-3 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-semibold">
                  <TrendingUp size={11} className="text-accent-blue" />
                  시세 변동
                </div>
                <div className="space-y-1.5">
                  {report.priceChanges.map((p) => {
                    const diff = p.after - p.before;
                    const isUp = diff >= 0;
                    return (
                      <div key={p.asset} className="bg-surface-secondary border border-border-light rounded-xl p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-text-primary">{p.asset}</span>
                          <span
                            className="text-[11px] font-mono font-semibold flex items-center gap-0.5"
                            style={{ color: isUp ? "#5B8C3E" : "#C85A4A" }}
                          >
                            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {isUp ? "+" : ""}{((diff / p.before) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-text-tertiary">
                          {formatKRW(p.before)} → {formatKRW(p.after)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Agent actions */}
              <div>
                <div className="text-text-tertiary mb-3 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-semibold">
                  <Users size={11} className="text-accent-green" />
                  에이전트 행동
                </div>
                <div className="space-y-1">
                  {report.agentActions.map((a, i) => {
                    const Icon = AGENT_ICONS[a.agentAlias] || AGENT_ICONS.default;
                    return (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-secondary/50 transition">
                        <div className="w-6 h-6 rounded-full bg-surface-secondary flex items-center justify-center flex-shrink-0">
                          <Icon size={12} className="text-text-tertiary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-text-primary font-medium">{a.agentAlias}</span>
                          <span className="text-[11px] text-text-tertiary ml-1.5">{a.action}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Events */}
              <div>
                <div className="text-text-tertiary mb-3 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-semibold">
                  <Zap size={11} className="text-accent-gold" />
                  주요 이벤트
                </div>
                <div className="bg-accent-gold/5 border border-accent-gold/15 rounded-xl p-2.5 mb-2">
                  <p className="text-[11px] text-accent-gold font-semibold">{report.keyEvent}</p>
                </div>
                <div className="space-y-1">
                  {events.map((e) => (
                    <div key={e.id} className="text-[11px] py-1">
                      <span
                        className={`font-mono mr-1.5 font-semibold ${
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
