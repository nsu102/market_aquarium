"use client";

import { useState } from "react";
import { MarketData } from "@/mock_data/market";
import {
  TrendingUp,
  TrendingDown,
  Gauge,
  AlertTriangle,
  Flame,
  ArrowUpCircle,
  ArrowDownCircle,
  BarChart3,
  Activity,
  Users,
} from "lucide-react";

function formatKRW(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return n.toLocaleString();
}

function MetricBar({
  value,
  label,
  color,
  icon: Icon,
}: {
  value: number;
  label: string;
  color: string;
  icon: React.ComponentType<any>;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-text-secondary flex items-center gap-1.5">
          <Icon size={12} style={{ color }} />
          {label}
        </span>
        <span className="font-mono font-semibold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 70 - 15}`
    )
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-14 h-7" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TABS = [
  { id: "overview", label: "종합", icon: Gauge },
  { id: "prices", label: "시세", icon: BarChart3 },
  { id: "metrics", label: "지표", icon: Activity },
  { id: "sentiment", label: "센티멘트", icon: Users },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MarketPanel({ data }: { data: MarketData }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const fgColor =
    data.fearGreedIndex < 30
      ? "#C85A4A"
      : data.fearGreedIndex < 50
        ? "#D4A843"
        : "#5B8C3E";
  const fgLabel =
    data.fearGreedIndex < 25
      ? "극도의 공포"
      : data.fearGreedIndex < 45
        ? "공포"
        : data.fearGreedIndex < 55
          ? "중립"
          : data.fearGreedIndex < 75
            ? "탐욕"
            : "극도의 탐욕";

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border-light flex-shrink-0 px-1 pt-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition cursor-pointer border-b-2 ${
                active
                  ? "border-accent-green text-accent-green"
                  : "border-transparent text-text-tertiary hover:text-text-secondary"
              }`}
            >
              <Icon size={11} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Fear & Greed */}
            <div className="p-3.5 bg-surface-secondary border border-border-light rounded-2xl">
              <div className="flex items-center gap-1.5 text-[11px] text-text-secondary mb-2.5">
                <Gauge size={13} />
                <span className="font-medium">공포 & 탐욕 지수</span>
              </div>
              <div className="flex items-baseline gap-2 justify-center mb-2">
                <span className="text-3xl font-bold font-mono" style={{ color: fgColor }}>
                  {data.fearGreedIndex}
                </span>
                <span className="text-xs font-medium" style={{ color: fgColor }}>
                  {fgLabel}
                </span>
              </div>
              <div className="h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${data.fearGreedIndex}%`,
                    background: `linear-gradient(90deg, #C85A4A, #D4A843, #5B8C3E)`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-text-tertiary mt-1 px-0.5">
                <span>공포</span>
                <span>탐욕</span>
              </div>
            </div>

            {/* Quick metrics summary */}
            <div className="grid grid-cols-2 gap-2">
              <QuickStat label="패닉셀" value={data.panicSellRatio} color="#C85A4A" />
              <QuickStat label="FOMO 매수" value={data.fomoBuyRatio} color="#5B8C3E" />
              <QuickStat label="루머 확산" value={data.rumorSpeed} color="#D4A843" />
              <QuickStat label="고래 매수" value={data.whaleBuyIntensity} color="#5B8FB9" />
            </div>

            {/* Top asset */}
            {data.assets.length > 0 && (() => {
              const top = data.assets[0];
              const isUp = top.change24h >= 0;
              return (
                <div className="bg-surface-secondary border border-border-light rounded-2xl p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{top.symbol}</div>
                      <div className="text-[10px] text-text-tertiary">{top.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-medium text-text-primary">{formatKRW(top.price)}</div>
                      <div className="text-[11px] font-mono font-medium flex items-center gap-0.5 justify-end" style={{ color: isUp ? "#5B8C3E" : "#C85A4A" }}>
                        {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {isUp ? "+" : ""}{top.change24h}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === "prices" && (
          <div>
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold mb-2.5">
              실시간 시세
            </div>
            <div className="bg-surface-secondary border border-border-light rounded-2xl overflow-hidden">
              {data.assets.map((a, i) => {
                const isUp = a.change24h >= 0;
                return (
                  <div
                    key={a.symbol}
                    className={`flex items-center justify-between px-3.5 py-3 ${
                      i < data.assets.length - 1 ? "border-b border-border-light" : ""
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{a.symbol}</div>
                      <div className="text-[10px] text-text-tertiary">{a.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MiniChart data={a.priceHistory} color={isUp ? "#5B8C3E" : "#C85A4A"} />
                      <div className="text-right">
                        <div className="text-sm font-mono font-medium text-text-primary">
                          {formatKRW(a.price)}
                        </div>
                        <div
                          className="text-[11px] font-mono flex items-center gap-0.5 justify-end font-medium"
                          style={{ color: isUp ? "#5B8C3E" : "#C85A4A" }}
                        >
                          {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {isUp ? "+" : ""}{a.change24h}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "metrics" && (
          <div>
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold mb-3">
              시장 지표
            </div>
            <div className="bg-surface-secondary border border-border-light rounded-2xl p-3.5">
              <MetricBar value={data.rumorSpeed} label="루머 확산 속도" color="#D4A843" icon={AlertTriangle} />
              <MetricBar value={data.panicSellRatio} label="패닉셀 비율" color="#C85A4A" icon={Flame} />
              <MetricBar value={data.fomoBuyRatio} label="FOMO 매수 비율" color="#5B8C3E" icon={TrendingUp} />
              <MetricBar value={data.whaleBuyIntensity} label="고래 매수 강도" color="#5B8FB9" icon={ArrowUpCircle} />
              <MetricBar value={data.whaleSellIntensity} label="고래 매도 강도" color="#D48A3C" icon={ArrowDownCircle} />
            </div>
          </div>
        )}

        {activeTab === "sentiment" && (
          <div>
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold mb-2.5">
              센티멘트 기여도
            </div>
            <div className="bg-surface-secondary border border-border-light rounded-2xl p-3.5">
              {data.sentimentContribution.map((s) => (
                <div
                  key={s.agent}
                  className="flex items-center justify-between text-[11px] py-1.5 border-b border-border-light last:border-0"
                >
                  <span className="text-text-secondary truncate">{s.agent}</span>
                  <span
                    className="font-mono font-semibold"
                    style={{ color: s.value >= 0 ? "#5B8C3E" : "#C85A4A" }}
                  >
                    {s.value >= 0 ? "+" : ""}{s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-surface-secondary border border-border-light rounded-xl p-2.5">
      <div className="text-[9px] text-text-tertiary mb-1">{label}</div>
      <div className="text-[16px] font-bold font-mono" style={{ color }}>{value}%</div>
    </div>
  );
}
