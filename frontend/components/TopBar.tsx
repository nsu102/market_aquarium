"use client";

import { useState } from "react";
import {
  BarChart3,
  Fish,
  Play,
  Pause,
  SkipForward,
  Send,
} from "lucide-react";

interface Props {
  round: number;
  playing: boolean;
  onTogglePlay: () => void;
  onNextRound: () => void;
  onEvent: (text: string) => void;
  onToggleMarket: () => void;
}

export default function TopBar({
  round,
  playing,
  onTogglePlay,
  onNextRound,
  onEvent,
  onToggleMarket,
}: Props) {
  const [eventText, setEventText] = useState("");

  const submit = () => {
    if (!eventText.trim()) return;
    onEvent(eventText.trim());
    setEventText("");
  };

  return (
    <div className="h-13 bg-surface-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0 shadow-soft">
      <button
        onClick={onToggleMarket}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-accent-green hover:bg-accent-green/10 transition cursor-pointer"
        title="시장 패널 토글"
      >
        <BarChart3 size={18} />
      </button>

      <div className="flex items-center gap-2 text-text-primary font-semibold text-sm tracking-wide select-none">
        <Fish size={18} className="text-accent-blue" />
        <span>MARKET AQUARIUM</span>
      </div>

      <div className="h-5 w-px bg-border-light" />

      <div className="flex items-center gap-1.5 bg-surface-secondary border border-border-light rounded-xl px-3 py-1.5">
        <span className="text-[11px] text-text-tertiary font-medium tracking-wider">
          Round
        </span>
        <span className="text-accent-green font-mono font-bold text-sm">
          {round}
        </span>
        <div className="w-px h-4 bg-border-light mx-1" />
        <button
          onClick={onTogglePlay}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
            playing
              ? "bg-accent-red/10 text-accent-red hover:bg-accent-red/20"
              : "bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
          }`}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={onNextRound}
          className="w-7 h-7 rounded-lg bg-surface-tertiary text-text-secondary flex items-center justify-center hover:bg-accent-blue/10 hover:text-accent-blue transition cursor-pointer"
        >
          <SkipForward size={14} />
        </button>
      </div>

      <div className="flex-1 max-w-xl">
        <div className="flex gap-2">
          <input
            value={eventText}
            onChange={(e) => setEventText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="이벤트 입력: 트럼프가 중국 반도체 관세를 예고했다..."
            className="flex-1 bg-surface-secondary border border-border-light rounded-xl px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue/40 focus:ring-2 focus:ring-accent-blue/10 transition"
          />
          <button
            onClick={submit}
            className="px-3 py-1.5 bg-accent-green text-white rounded-xl text-sm hover:bg-accent-green/90 transition flex items-center gap-1.5 shadow-soft cursor-pointer font-medium"
          >
            <Send size={13} />
            <span>전송</span>
          </button>
        </div>
      </div>
    </div>
  );
}
