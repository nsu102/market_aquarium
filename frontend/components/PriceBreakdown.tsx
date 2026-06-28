"use client";

import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { formatKRW } from "@/utils/numberInput";

/** FR-7 price-change components (sum ≈ total_pct). Mirrors backend PriceBreakdown. */
export interface PriceBreakdownData {
  symbol: string;
  event_impact: number;
  order_pressure: number;
  emotion_overheat: number;
  noise: number;
  total_pct: number;
  old_price?: number;
  new_price?: number;
}

const COMPONENTS: { key: keyof PriceBreakdownData; label: string }[] = [
  { key: "event_impact", label: "뉴스" },
  { key: "order_pressure", label: "매매" },
  { key: "emotion_overheat", label: "감정" },
  { key: "noise", label: "노이즈" },
];

const POS = "#78F142"; // green.200 — 상승 기여
const POS_TXT = "#327A1C"; // green.600
const NEG = "#C0564A"; // yellow.800 (번트 앰버) — 하락 기여 (빨강 미사용)

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/**
 * 시세 변화 구성 인포그래픽 — 자산별로 뉴스/매매/감정/노이즈 기여를 가운데
 * 기준 다이버징 바로 보여주고(상승=그린, 하락=앰버), 총 변화율과 가격 전이를 표시.
 * 에이전트 행동 아래에 배치하는 용도. props: 백엔드 round_report.price_breakdowns.
 */
export default function PriceBreakdown({
  breakdowns,
  max = 6,
}: {
  breakdowns: PriceBreakdownData[];
  max?: number;
}) {
  const items = (breakdowns || []).slice(0, max);
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-black">
        <BarChart3 size={13} />
        시세 변화 구성
      </div>
      {items.map((b) => {
        const up = b.total_pct >= 0;
        const comps = COMPONENTS.map((c) => ({ label: c.label, v: Number(b[c.key]) || 0 }));
        const scale = Math.max(1, ...comps.map((c) => Math.abs(c.v)));
        return (
          <div key={b.symbol} className="bg-white border-2 border-black rounded-xl p-2.5 shadow-pixel-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-bold text-black">{b.symbol}</span>
              <span
                className="text-[13px] font-bold flex items-center gap-0.5"
                style={{ color: up ? POS_TXT : NEG }}
              >
                {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {pct(b.total_pct)}
              </span>
            </div>

            <div className="space-y-1">
              {comps.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-[10px]">
                  <span className="w-8 text-pixel-muted font-bold">{c.label}</span>
                  {/* 가운데 기준 다이버징 바 */}
                  <div className="flex-1 h-3 flex border-2 border-black rounded overflow-hidden bg-pixel-wall">
                    <div className="w-1/2 flex justify-end">
                      {c.v < 0 && (
                        <div style={{ width: `${(Math.abs(c.v) / scale) * 100}%`, background: NEG }} className="h-full" />
                      )}
                    </div>
                    <div className="w-px h-full bg-black/40" />
                    <div className="w-1/2 flex justify-start">
                      {c.v >= 0 && (
                        <div style={{ width: `${(Math.abs(c.v) / scale) * 100}%`, background: POS }} className="h-full" />
                      )}
                    </div>
                  </div>
                  <span className="w-12 text-right font-bold" style={{ color: c.v >= 0 ? POS_TXT : NEG }}>
                    {pct(c.v)}
                  </span>
                </div>
              ))}
            </div>

            {b.old_price != null && b.new_price != null && (
              <div className="text-[10px] text-pixel-muted mt-1.5">
                {formatKRW(b.old_price)} → <span className="text-black font-bold">{formatKRW(b.new_price)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
