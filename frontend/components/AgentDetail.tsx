"use client";

import { Agent } from "@/mock_data/agents";
import { Wallet, Activity, Briefcase, User } from "lucide-react";
import { AGENT_ICONS } from "@/lib/agentIcons";
import { formatKRW } from "@/utils/numberInput";
import PixelModal from "@/components/pixel/PixelModal";

export default function AgentDetail({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const AgentIcon = AGENT_ICONS[agent.id] || AGENT_ICONS.default;

  return (
    <PixelModal
      isOpen
      onClose={onClose}
      size="sm"
      title={agent.alias}
      headerIcon={<User size={14} className="text-black" />}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 flex items-center justify-center border-2 border-black rounded-xl"
          style={{ background: agent.color }}
        >
          <AgentIcon size={22} className="text-black" />
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-black">{agent.alias}</div>
          <div className="text-[11px] text-pixel-muted">{agent.type}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-pixel-wall border-2 border-black rounded-xl p-3">
          <div className="text-[10px] text-pixel-muted flex items-center gap-1 mb-1 font-bold">
            <Wallet size={10} />
            보유 현금
          </div>
          <div className="text-sm font-bold text-black">{formatKRW(agent.cash)}원</div>
        </div>
        <div className="bg-pixel-wall border-2 border-black rounded-xl p-3">
          <div className="text-[10px] text-pixel-muted flex items-center gap-1 mb-1 font-bold">
            <Activity size={10} />
            최근 행동
          </div>
          <div className="text-sm font-bold text-black">{agent.lastAction}</div>
        </div>
        <StatBar label="공포 지수" value={agent.fear} fill="#C0564A" textColor="#C0564A" />
        <StatBar label="탐욕 지수" value={agent.greed} fill="#78F142" textColor="#327A1C" />
      </div>

      {/* Portfolio composition — cash + each asset as a share of total value */}
      <div className="bg-pixel-wall border-2 border-black rounded-xl p-3 mb-3">
        <div className="text-[10px] text-pixel-muted flex items-center gap-1 mb-2 font-bold">
          <Briefcase size={10} />
          포트폴리오 구성
        </div>
        {(() => {
          const ASSET_COLORS = ["#78F142", "#327A1C", "#4FA82A", "#B7EE8C", "#1E4D11"];
          const holdings = agent.portfolio.map((p) => ({
            label: p.asset,
            value: p.amount * p.avgPrice,
          }));
          const total = agent.cash + holdings.reduce((s, h) => s + h.value, 0);
          if (total <= 0) return <div className="text-[11px] text-pixel-muted">자산 없음</div>;
          const segs = [
            { label: "현금", value: agent.cash, color: "#5E7350" },
            ...holdings.map((h, i) => ({ ...h, color: ASSET_COLORS[i % ASSET_COLORS.length] })),
          ].filter((s) => s.value > 0);
          return (
            <>
              {/* stacked composition bar */}
              <div className="flex h-4 border-2 border-black rounded-full overflow-hidden mb-2">
                {segs.map((s) => (
                  <div
                    key={s.label}
                    style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                    title={`${s.label} ${((s.value / total) * 100).toFixed(0)}%`}
                  />
                ))}
              </div>
              {/* legend */}
              <div className="space-y-1">
                {segs.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-3 h-3 rounded-sm border border-black shrink-0" style={{ background: s.color }} />
                    <span className="text-black font-bold flex-1">{s.label}</span>
                    <span className="text-pixel-muted">{formatKRW(Math.round(s.value))}</span>
                    <span className="text-black font-bold w-10 text-right">
                      {((s.value / total) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* Quote */}
      {agent.bubble && (
        <div className="bg-pixel-path border-2 border-black rounded-xl p-3 text-center">
          <p className="text-[12px] text-black">&ldquo;{agent.bubble}&rdquo;</p>
        </div>
      )}
    </PixelModal>
  );
}

function StatBar({
  label,
  value,
  fill,
  textColor,
}: {
  label: string;
  value: number;
  fill: string;
  textColor: string;
}) {
  return (
    <div className="bg-pixel-wall border-2 border-black p-3">
      <div className="text-[10px] text-pixel-muted mb-1.5 font-bold">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2.5 bg-pixel-path border-2 border-black rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: fill }} />
        </div>
        <span className="text-[11px] font-bold w-6 text-right" style={{ color: textColor }}>
          {value}
        </span>
      </div>
    </div>
  );
}
