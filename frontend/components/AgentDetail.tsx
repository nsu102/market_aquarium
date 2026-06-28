"use client";

import Image from "next/image";
import { Agent } from "@/mock_data/agents";
import { X, Wallet, Activity, Briefcase, MapPin } from "lucide-react";
import { getAgentProfile } from "@/lib/agentProfiles";
import { formatKRW } from "@/utils/numberInput";
import { AGENT_PROFILES } from "@/constants/agentProfiles";

export default function AgentDetail({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const profile = getAgentProfile(agent.id);
  const meta = AGENT_PROFILES.find((p) => p.id === agent.id);
  const locationLabel = { home: "집 (관망)", community: "게시판", exchange: "거래소" }[agent.location] || agent.location;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-border rounded-2xl w-[380px] max-w-[90vw] shadow-elevated animate-slide-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with profile image */}
        <div
          className="relative px-5 pt-5 pb-4"
          style={{ background: `linear-gradient(135deg, ${agent.color}08, ${agent.color}15)` }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-surface-card/80 flex items-center justify-center text-text-tertiary hover:text-text-primary transition cursor-pointer"
          >
            <X size={14} />
          </button>

          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-xl border-2 overflow-hidden flex items-center justify-center bg-surface-card"
              style={{ borderColor: `${agent.color}40` }}
            >
              <Image
                src={profile}
                alt={agent.alias}
                width={48}
                height={48}
                style={{ imageRendering: "pixelated" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-text-primary">{agent.alias}</div>
              <div className="text-[11px] text-text-tertiary font-mono mb-1.5">{agent.type}</div>
              {meta?.traits && (
                <div className="flex flex-wrap gap-1">
                  {meta.traits.map((t) => (
                    <span
                      key={t}
                      className="text-[9px] px-1.5 py-[1px] rounded-md font-medium"
                      style={{ background: `${agent.color}12`, color: agent.color }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {meta?.description && (
            <p className="text-[11px] text-text-secondary mt-3 leading-[1.5]">{meta.description}</p>
          )}
        </div>

        <div className="p-4 space-y-3">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatBox icon={Wallet} label="보유 현금" value={`${formatKRW(agent.cash)}원`} />
            <StatBox icon={Activity} label="최근 행동" value={agent.lastAction || "대기"} />
            <StatBox icon={MapPin} label="현재 위치" value={locationLabel} />
            <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
              <div className="text-[10px] text-text-tertiary mb-1.5 font-medium">공포 / 탐욕</div>
              <div className="space-y-1.5">
                <Bar value={agent.fear} color="#C85A4A" label="공포" />
                <Bar value={agent.greed} color="#5B8C3E" label="탐욕" />
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
                    <span className="text-text-tertiary font-mono">avg {formatKRW(p.avgPrice)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bubble quote */}
          {agent.bubble && (
            <div
              className="rounded-xl p-3 text-center"
              style={{ background: `${agent.color}08`, border: `1px solid ${agent.color}15` }}
            >
              <p className="text-[12px] italic" style={{ color: agent.color }}>
                &ldquo;{agent.bubble}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: React.ComponentType<any>; label: string; value: string }) {
  return (
    <div className="bg-surface-secondary border border-border-light rounded-xl p-3">
      <div className="text-[10px] text-text-tertiary flex items-center gap-1 mb-1 font-medium">
        <Icon size={10} />{label}
      </div>
      <div className="text-sm font-semibold text-text-primary truncate">{value}</div>
    </div>
  );
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-text-tertiary w-5">{label}</span>
      <div className="flex-1 h-[5px] bg-surface-tertiary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono font-semibold w-5 text-right" style={{ color }}>{value}</span>
    </div>
  );
}
