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
import { formatKRW } from "@/utils/numberInput";

// 2-Hue 팔레트 (그린/옐로만, 빨강·파랑 없음 — DESIGN.md)
const C = {
  danger: "#C0564A", // yellow.800 (위험/하락)
  green: "#327A1C",  // green.600 (성공/상승)
  gold: "#A8741A",   // yellow.600 (경고/목재)
  blue: "#327A1C",   // 정보 = green.600 (파랑 대체)
  orange: "#A8741A", // yellow.600
};

/** ratio(0~1) -> 정수 % */
const pct = (x: number) => Math.round((x || 0) * 100);
/** 지수/소수 반올림 */
const r0 = (x: number) => Math.round(x || 0);

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
        <span className="text-black flex items-center gap-1.5 font-bold">
          <Icon size={12} style={{ color }} />
          {label}
        </span>
        <span className="font-bold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-2.5 bg-pixel-path border-2 border-black rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
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

  const fgi = r0(data.fearGreedIndex);
  const fgColor = fgi < 30 ? C.danger : fgi < 50 ? C.gold : C.green;
  const fgLabel =
    fgi < 25 ? "극도의 공포" : fgi < 45 ? "공포" : fgi < 55 ? "중립" : fgi < 75 ? "탐욕" : "극도의 탐욕";

  return (
    <div className="h-full flex flex-col bg-pixel-wall">
      {/* Tabs */}
      <div className="flex border-b-2 border-black flex-shrink-0 bg-pixel-table">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[10px] font-bold cursor-pointer border-r-2 border-black last:border-r-0 ${
                active ? "bg-pixel-grass text-black" : "text-black/70 hover:bg-pixel-path"
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
          <div className="space-y-3">
            {/* Fear & Greed */}
            <div className="p-3.5 bg-white border-2 border-black rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] text-black mb-2.5 font-bold">
                <Gauge size={13} />
                <span>공포 & 탐욕 지수</span>
              </div>
              <div className="flex items-baseline gap-2 justify-center mb-2">
                <span className="text-3xl font-bold" style={{ color: fgColor }}>
                  {fgi}
                </span>
                <span className="text-xs font-bold" style={{ color: fgColor }}>
                  {fgLabel}
                </span>
              </div>
              <div className="h-3 bg-pixel-path border-2 border-black rounded-full overflow-hidden flex">
                <div
                  style={{
                    width: `${fgi}%`,
                    background: "linear-gradient(90deg, #C0564A, #FFD23F, #78F142)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-pixel-muted mt-1 px-0.5 font-bold">
                <span>공포</span>
                <span>탐욕</span>
              </div>
            </div>

            {/* Quick metrics */}
            <div className="grid grid-cols-2 gap-2">
              <QuickStat label="패닉셀" value={pct(data.panicSellRatio)} color={C.danger} />
              <QuickStat label="FOMO 매수" value={pct(data.fomoBuyRatio)} color={C.green} />
              <QuickStat label="루머 확산" value={pct(data.rumorSpeed)} color={C.gold} />
              <QuickStat label="고래 매수" value={pct(data.whaleBuyIntensity)} color={C.blue} />
            </div>

            {/* Top asset */}
            {data.assets.length > 0 &&
              (() => {
                const top = data.assets[0];
                const isUp = top.change24h >= 0;
                return (
                  <div className="bg-white border-2 border-black rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-black">{top.symbol}</div>
                        <div className="text-[10px] text-pixel-muted">{top.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-black">{formatKRW(top.price)}</div>
                        <div
                          className="text-[11px] font-bold flex items-center gap-0.5 justify-end"
                          style={{ color: isUp ? C.green : C.danger }}
                        >
                          {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {isUp ? "+" : ""}
                          {top.change24h.toFixed(1)}%
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
            <div className="text-[10px] text-black tracking-wider font-bold mb-2.5">실시간 시세</div>
            <div className="bg-white border-2 border-black rounded-xl overflow-hidden">
              {data.assets.map((a, i) => {
                const isUp = a.change24h >= 0;
                return (
                  <div
                    key={a.symbol}
                    className={`flex items-center justify-between px-3.5 py-3 ${
                      i < data.assets.length - 1 ? "border-b-2 border-black" : ""
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-black">{a.symbol}</div>
                      <div className="text-[10px] text-pixel-muted">{a.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-black">{formatKRW(a.price)}</div>
                      <div
                        className="text-[11px] flex items-center gap-0.5 justify-end font-bold"
                        style={{ color: isUp ? C.green : C.danger }}
                      >
                        {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {isUp ? "+" : ""}
                        {a.change24h.toFixed(1)}%
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
            <div className="text-[10px] text-black tracking-wider font-bold mb-3">시장 지표</div>
            <div className="bg-white border-2 border-black rounded-xl p-3.5">
              <MetricBar value={pct(data.rumorSpeed)} label="루머 확산 속도" color={C.gold} icon={AlertTriangle} />
              <MetricBar value={pct(data.panicSellRatio)} label="패닉셀 비율" color={C.danger} icon={Flame} />
              <MetricBar value={pct(data.fomoBuyRatio)} label="FOMO 매수 비율" color={C.green} icon={TrendingUp} />
              <MetricBar value={pct(data.whaleBuyIntensity)} label="고래 매수 강도" color={C.blue} icon={ArrowUpCircle} />
              <MetricBar value={pct(data.whaleSellIntensity)} label="고래 매도 강도" color={C.orange} icon={ArrowDownCircle} />
            </div>
          </div>
        )}

        {activeTab === "sentiment" && (
          <div>
            <div className="text-[10px] text-black tracking-wider font-bold mb-2.5">센티멘트 기여도</div>
            <div className="bg-white border-2 border-black rounded-xl p-3.5">
              {data.sentimentContribution.map((s) => (
                <div
                  key={s.agent}
                  className="flex items-center justify-between text-[11px] py-1.5 border-b border-black/20 last:border-0"
                >
                  <span className="text-black truncate font-bold">{s.agent}</span>
                  <span className="font-bold" style={{ color: s.value >= 0 ? C.green : C.danger }}>
                    {s.value >= 0 ? "+" : ""}
                    {s.value.toFixed(1)}
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
    <div className="bg-white border-2 border-black rounded-xl p-2.5">
      <div className="text-[9px] text-pixel-muted mb-1 font-bold">{label}</div>
      <div className="text-[16px] font-bold" style={{ color }}>
        {value}%
      </div>
    </div>
  );
}
