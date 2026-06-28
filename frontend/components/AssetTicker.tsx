"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Asset } from "@/mock_data/market";
import { formatKRW } from "@/utils/numberInput";

const UP = "#327A1C";
const DOWN = "#C0564A";
const MAX_ASSETS = 8;

interface Props {
  assets: Asset[];
}

/** Tiny inline price sparkline from an asset's priceHistory. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 56;
  const h = 24;
  if (!data || data.length < 2) {
    return (
      <svg width={w} height={h} className="shrink-0">
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth={1.5} opacity={0.4} />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Bottom dock: market price ticker. Each cell is [name][price][change%] + a
 * small sparkline, laid out in a single horizontal row. Caps the displayed
 * default assets at 8.
 */
export default function AssetTicker({ assets }: Props) {
  const shown = assets.slice(0, MAX_ASSETS);

  return (
    <div className="shrink-0 h-[88px] border-t-2 border-black bg-pixel-table px-3 flex items-center gap-2 overflow-x-auto">
      {shown.length === 0 ? (
        <div className="text-[12px] text-pixel-muted font-bold px-2">시세 데이터 대기 중...</div>
      ) : (
        shown.map((a) => {
          const up = a.change24h >= 0;
          const color = up ? UP : DOWN;
          const TrendIcon = up ? TrendingUp : TrendingDown;
          return (
            <div
              key={a.symbol}
              className="flex items-center gap-2 shrink-0 border-2 border-black rounded-xl bg-white px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-black truncate max-w-[88px]">
                  {a.name || a.symbol}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-bold text-black">{formatKRW(a.price)}</span>
                  <span
                    className="text-[10px] font-bold inline-flex items-center gap-0.5"
                    style={{ color }}
                  >
                    <TrendIcon size={10} />
                    {up ? "+" : ""}
                    {a.change24h.toFixed(1)}%
                  </span>
                </div>
              </div>
              <Sparkline data={a.priceHistory} color={color} />
            </div>
          );
        })
      )}
    </div>
  );
}
