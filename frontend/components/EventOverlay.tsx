"use client";

import { useEffect, useState } from "react";
import { Zap, AlertTriangle, TrendingUp, Radio } from "lucide-react";

interface Props {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
  onDone: () => void;
}

export default function EventOverlay({ text, impact, source, onDone }: Props) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 50);
    const t2 = setTimeout(() => setPhase("exit"), 2800);
    const t3 = setTimeout(onDone, 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const impactColor =
    impact === "negative" ? "#C85A4A" : impact === "positive" ? "#5B8C3E" : "#D4A843";

  const ImpactIcon =
    impact === "negative" ? AlertTriangle : impact === "positive" ? TrendingUp : Radio;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-opacity duration-500 ${
        phase === "enter" ? "opacity-0" : phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-text-primary/40 backdrop-blur-sm" />

      {/* Main content */}
      <div
        className={`relative max-w-2xl w-full mx-8 transition-all duration-600 ${
          phase === "hold"
            ? "translate-y-0 scale-100 opacity-100"
            : phase === "enter"
              ? "translate-y-8 scale-95 opacity-0"
              : "-translate-y-4 scale-95 opacity-0"
        }`}
      >
        {/* Parchment-style card */}
        <div className="relative bg-[#F7F2E8] rounded-2xl border-2 shadow-elevated overflow-hidden"
          style={{ borderColor: `${impactColor}40` }}
        >
          {/* Top decorative bar */}
          <div className="h-1.5" style={{ background: impactColor }} />

          {/* Scroll pattern top */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${impactColor}15` }}>
              <Zap size={20} style={{ color: impactColor }} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: impactColor }}>
                {source === "user" ? "Breaking Event" : "Market Signal"}
              </div>
              <div className="text-[10px] text-text-tertiary font-mono mt-0.5">
                Round in progress
              </div>
            </div>
            <div className="ml-auto">
              <ImpactIcon size={28} style={{ color: `${impactColor}60` }} />
            </div>
          </div>

          {/* Event text */}
          <div className="px-6 py-5">
            <p className="text-xl font-bold text-text-primary leading-snug tracking-tight">
              {text}
            </p>
          </div>

          {/* Bottom info strip */}
          <div className="px-6 pb-4 flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: `${impactColor}12`, color: impactColor }}
            >
              <ImpactIcon size={10} />
              {impact === "negative" ? "악재" : impact === "positive" ? "호재" : "중립"}
            </span>
            <span className="text-[10px] text-text-tertiary font-mono">
              {new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>

          {/* Corner decorations */}
          <svg className="absolute top-3 right-3 w-6 h-6 opacity-10" viewBox="0 0 24 24">
            <path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm16 0v6h-6v-2h4v-4h2z" fill={impactColor} />
          </svg>
        </div>

        {/* Shimmer line at bottom */}
        <div className="mt-3 flex justify-center">
          <div
            className="h-0.5 rounded-full animate-pulse-soft"
            style={{ width: "120px", background: `${impactColor}40` }}
          />
        </div>
      </div>
    </div>
  );
}
