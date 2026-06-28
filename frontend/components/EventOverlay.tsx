"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, AlertTriangle, TrendingUp, Radio } from "lucide-react";

interface Props {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
  onDone: () => void;
}

export default function EventOverlay({ text, impact, source, onDone }: Props) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");
  // Keep onDone in a ref so the dismiss timers run ONCE on mount and are not
  // reset on every parent re-render (handleTick re-renders the page each step,
  // which previously restarted the timer and kept the modal up forever).
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 30);
    const t2 = setTimeout(() => setPhase("exit"), 1300);
    const t3 = setTimeout(() => onDoneRef.current(), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // 픽셀 팔레트: 악재=danger, 호재=grass, 중립=path
  const accent =
    impact === "negative" ? "#C0564A" : impact === "positive" ? "#78F142" : "#FFE87C";
  const ImpactIcon =
    impact === "negative" ? AlertTriangle : impact === "positive" ? TrendingUp : Radio;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none ${
        phase === "hold" ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-pixel-ink/60" />

      <div
        className={`relative max-w-2xl w-full mx-8 ${
          phase === "hold" ? "animate-pixel-pop" : ""
        }`}
      >
        <div className="relative bg-white border-2 border-black rounded-2xl shadow-pixel-lg overflow-hidden">
          {/* Top accent bar */}
          <div className="h-2 border-b-2 border-black" style={{ background: accent }} />

          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-2">
            <div
              className="w-10 h-10 flex items-center justify-center border-2 border-black rounded-xl"
              style={{ background: accent }}
            >
              <Zap size={20} className="text-black" />
            </div>
            <div>
              <div className="text-[11px] tracking-[0.18em] font-bold text-black">
                {source === "user" ? "BREAKING EVENT" : "MARKET SIGNAL"}
              </div>
              <div className="text-[10px] text-pixel-muted mt-0.5">Round in progress</div>
            </div>
            <div className="ml-auto">
              <ImpactIcon size={26} className="text-black" />
            </div>
          </div>

          {/* Event text */}
          <div className="px-6 py-5 pb-6">
            <p className="text-xl font-bold text-black leading-snug">{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
