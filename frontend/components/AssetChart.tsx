"use client";

import {
  ChartCanvas,
  Chart,
  AreaSeries,
  XAxis,
  YAxis,
  CrossHairCursor,
  MouseCoordinateX,
  MouseCoordinateY,
  discontinuousTimeScaleProviderBuilder,
} from "react-financial-charts";
import { formatKRW } from "@/utils/numberInput";

interface Point {
  date: Date;
  close: number;
}

interface Props {
  priceHistory: number[];
  color: string;
  width?: number;
  height?: number;
}

const HOUR = 60 * 60 * 1000;

/**
 * Yahoo-Finance-style area chart for a single asset, built from its
 * priceHistory line. Client-only (react-financial-charts touches the canvas /
 * window), so callers dynamic-import this with ssr:false.
 */
export default function AssetChart({ priceHistory, color, width = 600, height = 300 }: Props) {
  const series = priceHistory.length >= 2 ? priceHistory : [priceHistory[0] ?? 0, priceHistory[0] ?? 0];
  const now = Date.now();
  const raw: Point[] = series.map((close, i) => ({
    date: new Date(now - (series.length - 1 - i) * HOUR),
    close,
  }));

  const scaleProvider = discontinuousTimeScaleProviderBuilder().inputDateAccessor(
    (d: Point) => d.date
  );
  const { data, xScale, xAccessor, displayXAccessor } = scaleProvider(raw);
  const xExtents = [xAccessor(data[0]), xAccessor(data[data.length - 1])];

  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = (max - min || max || 1) * 0.08;
  const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const fill =
    color === "#327A1C" ? "rgba(50,122,28,0.18)" : "rgba(192,86,74,0.18)";

  return (
    <ChartCanvas
      height={height}
      width={width}
      ratio={ratio}
      margin={{ left: 8, right: 64, top: 12, bottom: 28 }}
      data={data}
      seriesName="asset"
      xScale={xScale}
      xAccessor={xAccessor}
      displayXAccessor={displayXAccessor}
      xExtents={xExtents}
    >
      <Chart id={1} yExtents={() => [min - pad, max + pad]}>
        <XAxis
          showGridLines
          gridLinesStrokeStyle="#EAEAEA"
          tickLabelFill="#5b6b50"
          strokeStyle="#1E1A17"
        />
        <YAxis
          showGridLines
          gridLinesStrokeStyle="#EAEAEA"
          tickLabelFill="#5b6b50"
          strokeStyle="#1E1A17"
          tickFormat={(v: number) => formatKRW(v)}
        />
        <AreaSeries
          yAccessor={(d: Point) => d.close}
          strokeStyle={color}
          fillStyle={fill}
        />
        <MouseCoordinateX
          displayFormat={(d: Date) =>
            d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
          }
        />
        <MouseCoordinateY displayFormat={(v: number) => formatKRW(v)} />
      </Chart>
      <CrossHairCursor strokeStyle="#1E1A17" />
    </ChartCanvas>
  );
}
