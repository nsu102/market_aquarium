"use client";

import { useState } from "react";
import {
  Fish,
  BarChart3,
  MessageSquare,
  Play,
  Pause,
  SkipForward,
  Send,
  Zap,
  X,
} from "lucide-react";

interface Props {
  round: number;
  playing: boolean;
  onTogglePlay: () => void;
  onNextRound: () => void;
  onEvent: (text: string) => void;
  marketOpen: boolean;
  boardOpen: boolean;
  onToggleMarket: () => void;
  onToggleBoard: () => void;
  marketNotifications: number;
  boardNotifications: number;
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  const display = count > 99 ? "99+" : count;
  return (
    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-[#C85A4A] text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none shadow-sm">
      {display}
    </span>
  );
}

export default function GameHUD({
  round,
  playing,
  onTogglePlay,
  onNextRound,
  onEvent,
  marketOpen,
  boardOpen,
  onToggleMarket,
  onToggleBoard,
  marketNotifications,
  boardNotifications,
}: Props) {
  const [eventOpen, setEventOpen] = useState(false);
  const [eventText, setEventText] = useState("");

  const submit = () => {
    if (!eventText.trim()) return;
    onEvent(eventText.trim());
    setEventText("");
    setEventOpen(false);
  };

  return (
    <>
      {/* ── Top-left: Logo ── */}
      <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-surface-card/90 backdrop-blur-md border border-border-light rounded-xl px-3 py-2 shadow-soft">
          <Fish size={18} className="text-accent-blue" />
          <span className="text-sm font-bold text-text-primary tracking-wide">MARKET AQUARIUM</span>
        </div>
      </div>

      {/* ── Top-right: Toggle buttons ── */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        {/* Market panel toggle */}
        <button
          onClick={onToggleMarket}
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer shadow-soft border ${
            marketOpen
              ? "bg-accent-green/15 border-accent-green/30 text-accent-green"
              : "bg-surface-card/90 backdrop-blur-md border-border-light text-text-secondary hover:text-accent-green hover:border-accent-green/20"
          }`}
          title="시장 패널"
        >
          <BarChart3 size={18} />
          {!marketOpen && <Badge count={marketNotifications} />}
        </button>

        {/* Board feed toggle */}
        <button
          onClick={onToggleBoard}
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer shadow-soft border ${
            boardOpen
              ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue"
              : "bg-surface-card/90 backdrop-blur-md border-border-light text-text-secondary hover:text-accent-blue hover:border-accent-blue/20"
          }`}
          title="게시판"
        >
          <MessageSquare size={18} />
          {!boardOpen && <Badge count={boardNotifications} />}
        </button>
      </div>

      {/* ── Top-center: Round controls ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-1.5 bg-surface-card/90 backdrop-blur-md border border-border-light rounded-xl px-3 py-1.5 shadow-soft">
          <span className="text-[11px] text-text-tertiary font-medium tracking-wider">Round</span>
          <span className="text-accent-green font-mono font-bold text-sm">{round}</span>
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
      </div>

      {/* ── Bottom-center: Event input trigger ── */}
      {!eventOpen && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setEventOpen(true)}
            className="flex items-center gap-2 bg-surface-card/90 backdrop-blur-md border border-border-light rounded-xl px-4 py-2.5 shadow-soft hover:border-accent-gold/30 hover:shadow-md transition cursor-pointer group"
          >
            <Zap size={15} className="text-accent-gold group-hover:scale-110 transition-transform" />
            <span className="text-[12px] text-text-secondary font-medium">이벤트 입력</span>
          </button>
        </div>
      )}

      {/* ── Bottom-center: Event input expanded ── */}
      {eventOpen && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 w-[520px] max-w-[90vw] animate-slide-up">
          <div className="bg-surface-card/95 backdrop-blur-md border border-border-light rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-accent-gold" />
              <span className="text-[11px] text-text-tertiary font-semibold uppercase tracking-wider">Global Event</span>
              <div className="flex-1" />
              <button
                onClick={() => setEventOpen(false)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={eventText}
                onChange={(e) => setEventText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="트럼프가 중국 반도체 관세를 예고했다..."
                autoFocus
                className="flex-1 bg-surface-secondary border border-border-light rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-gold/40 focus:ring-2 focus:ring-accent-gold/10 transition"
              />
              <button
                onClick={submit}
                disabled={!eventText.trim()}
                className="px-4 py-2 bg-accent-gold/15 border border-accent-gold/30 text-accent-gold rounded-xl text-sm hover:bg-accent-gold/25 transition flex items-center gap-1.5 cursor-pointer font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={13} />
                <span>전송</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
