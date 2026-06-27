"use client";

import { Agent } from "@/mock_data/agents";
import { X, Wallet, Activity, Briefcase } from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";

function formatKRW(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return n.toLocaleString();
}

export default function AgentDetail({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const AgentIcon = AGENT_ICONS[agent.id] || AGENT_ICONS.default;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-border rounded-2xl w-[380px] max-w-[90vw] p-5 shadow-elevated animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center border"
            style={{
              background: `${agent.color}12`,
              borderColor: `${agent.color}30`,
            }}
          >
            <AgentIcon size={22} style={{ color: agent.color }} />
          </div>
          <div className="flex-1">
            <div className="text-base font-bold text-text-primary">
              {agent.alias}
            </div>
            <div className="text-[11px] text-text-tertiary font-mono">
              {agent.type}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
            <div className="text-[10px] text-text-tertiary flex items-center gap-1 mb-1 font-medium">
              <Wallet size={10} />
              보유 현금
            </div>
            <div className="text-sm font-mono font-semibold text-text-primary">
              {formatKRW(agent.cash)}원
            </div>
          </div>
          <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
            <div className="text-[10px] text-text-tertiary flex items-center gap-1 mb-1 font-medium">
              <Activity size={10} />
              최근 행동
            </div>
            <div className="text-sm font-semibold text-text-primary">{agent.lastAction}</div>
          </div>
          <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
            <div className="text-[10px] text-text-tertiary mb-1.5 font-medium">공포 지수</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-red rounded-full transition-all"
                  style={{ width: `${agent.fear}%` }}
                />
              </div>
              <span className="text-[11px] text-accent-red font-mono font-semibold w-6 text-right">
                {agent.fear}
              </span>
            </div>
          </div>
          <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
            <div className="text-[10px] text-text-tertiary mb-1.5 font-medium">탐욕 지수</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-green rounded-full transition-all"
                  style={{ width: `${agent.greed}%` }}
                />
              </div>
              <span className="text-[11px] text-accent-green font-mono font-semibold w-6 text-right">
                {agent.greed}
              </span>
            </div>
          </div>
        </div>

        {/* Portfolio */}
        <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
          <div className="text-[10px] text-text-tertiary flex items-center gap-1 mb-2 font-medium">
            <Briefcase size={10} />
            포트폴리오
          </div>
          {agent.portfolio.length === 0 ? (
            <div className="text-[11px] text-text-tertiary">보유 자산 없음</div>
          ) : (
            <div className="space-y-1.5">
              {agent.portfolio.map((p) => (
                <div key={p.asset} className="flex justify-between text-[12px]">
                  <span className="text-text-primary font-semibold">{p.asset}</span>
                  <span className="text-text-primary font-mono">{p.amount}</span>
                  <span className="text-text-tertiary font-mono">
                    avg {formatKRW(p.avgPrice)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quote */}
        <div className="mt-3 bg-surface-secondary border border-border-light rounded-xl p-3 text-center">
          <AgentIcon
            size={20}
            className="mx-auto mb-1.5"
            style={{ color: agent.color }}
          />
          <p className="text-[12px] text-text-secondary italic">
            &ldquo;{agent.bubble}&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}
