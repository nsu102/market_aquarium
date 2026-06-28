"use client";

import dynamic from "next/dynamic";
import { TrendingUp, TrendingDown, X, BarChart3 } from "lucide-react";
import { Asset } from "@/mock_data/market";
import { formatKRW } from "@/utils/numberInput";

const UP = "#327A1C";
const DOWN = "#C0564A";

// Chart is client-only (react-financial-charts uses the canvas/window).
const AssetChart = dynamic(() => import("@/components/AssetChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] flex items-center justify-center text-pixel-muted text-sm font-bold">
      차트 불러오는 중...
    </div>
  ),
});

interface Props {
  asset: Asset;
  onClose: () => void;
}

/** Yahoo-Finance-style asset profile: header + stats + price chart, in a modal. */
export default function AssetModal({ asset, onClose }: Props) {
  const up = asset.change24h >= 0;
  const color = up ? UP : DOWN;
  const TrendIcon = up ? TrendingUp : TrendingDown;
  const hist = asset.priceHistory.length ? asset.priceHistory : [asset.price];
  const high = Math.max(...hist);
  const low = Math.min(...hist);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-pixel-ink/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] bg-white border-2 border-black rounded-2xl shadow-pixel-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b-2 border-black bg-pixel-table">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://assets.coincap.io/assets/icons/${asset.symbol.toLowerCase()}@2x.png`}
            alt={asset.symbol}
            width={36}
            height={36}
            className="shrink-0 rounded-lg border-2 border-black"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-black truncate">{asset.name}</div>
            <div className="text-[11px] text-pixel-muted">{asset.symbol}</div>
          </div>
          <div className="text-right tabular-nums">
            <div className="text-lg font-bold text-black">{formatKRW(asset.price)}원</div>
            <div
              className="text-[12px] font-bold inline-flex items-center gap-0.5 justify-end"
              style={{ color }}
            >
              <TrendIcon size={12} />
              {up ? "+" : ""}
              {asset.change24h.toFixed(1)}%
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-1 w-7 h-7 shrink-0 flex items-center justify-center border-2 border-black rounded-md bg-white hover:bg-pixel-path cursor-pointer"
            title="닫기"
          >
            <X size={13} className="text-black" />
          </button>
        </div>

        {/* Chart */}
        <div className="px-3 pt-3">
          <AssetChart priceHistory={hist} color={color} width={684} height={300} />
        </div>

        {/* Stats — Yahoo-style key facts */}
        <div className="grid grid-cols-4 gap-2 px-5 py-4 tabular-nums">
          <Stat label="현재가" value={`${formatKRW(asset.price)}원`} />
          <Stat
            label="24h 변동"
            value={`${up ? "+" : ""}${asset.change24h.toFixed(1)}%`}
            color={color}
          />
          <Stat label="기간 고가" value={`${formatKRW(high)}원`} />
          <Stat label="기간 저가" value={`${formatKRW(low)}원`} />
          <Stat label="거래량" value={formatKRW(asset.volume)} />
          <Stat label="데이터 포인트" value={`${hist.length}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-pixel-wall border-2 border-black rounded-lg p-2.5 min-w-0">
      <div className="text-[10px] text-pixel-muted font-bold mb-1">{label}</div>
      <div className="text-[13px] font-bold truncate" style={{ color: color || "#1E1A17" }}>
        {value}
      </div>
    </div>
  );
}
