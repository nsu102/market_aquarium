"use client";

import { useState } from "react";
import {
  Fish,
  BarChart3,
  MessageSquare,
  Send,
  Zap,
  X,
  ZoomIn,
  ZoomOut,
  FileText,
} from "lucide-react";

interface Props {
  round: number;
  onEvent: (text: string) => void;
  marketOpen: boolean;
  boardOpen: boolean;
  onToggleMarket: () => void;
  onToggleBoard: () => void;
  onToggleReport: () => void;
  reportOpen: boolean;
  marketNotifications: number;
  boardNotifications: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  isProcessing?: boolean;
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
  onEvent,
  marketOpen,
  boardOpen,
  onToggleMarket,
  onToggleBoard,
  onToggleReport,
  reportOpen,
  marketNotifications,
  boardNotifications,
  onZoomIn,
  onZoomOut,
  isProcessing,
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
      <div className="absolute top-4 left-4 z-40">
        <div className="flex items-center gap-2 bg-surface-card border border-border-light rounded-xl px-3 py-2 shadow-soft">
          <Fish size={18} className="text-accent-blue" />
          <span className="text-sm font-bold text-text-primary tracking-wide">MARKET AQUARIUM</span>
        </div>
      </div>

      {/* ── Bottom-center: Toolbar ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-1 bg-surface-card border border-border-light rounded-2xl px-2 py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.18)]">

          {/* Market toggle */}
          <ToolbarBtn
            onClick={onToggleMarket}
            active={marketOpen}
            icon={BarChart3}
            label="시장"
            activeColor="accent-green"
            badge={!marketOpen ? marketNotifications : 0}
          />

          {/* Board toggle */}
          <ToolbarBtn
            onClick={onToggleBoard}
            active={boardOpen}
            icon={MessageSquare}
            label="게시판"
            activeColor="accent-blue"
            badge={!boardOpen ? boardNotifications : 0}
          />

          {/* Report */}
          <ToolbarBtn
            onClick={onToggleReport}
            active={reportOpen}
            icon={FileText}
            label="리포트"
            activeColor="accent-gold"
          />

          <div className="w-px h-7 bg-border-light mx-1" />

          {/* Round display */}
          <div className="flex items-center gap-1 px-1">
            <span className="text-[10px] text-text-tertiary font-medium">R</span>
            <span className="text-accent-green font-mono font-bold text-sm min-w-[16px] text-center">{round}</span>
          </div>

          <div className="w-px h-7 bg-border-light mx-1" />

          {/* Zoom */}
          <button onClick={onZoomOut} className="w-8 h-8 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition cursor-pointer flex items-center justify-center">
            <ZoomOut size={15} />
          </button>
          <button onClick={onZoomIn} className="w-8 h-8 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition cursor-pointer flex items-center justify-center">
            <ZoomIn size={15} />
          </button>

          <div className="w-px h-7 bg-border-light mx-1" />

          {/* Event trigger */}
          <button
            onClick={() => !isProcessing && setEventOpen(true)}
            disabled={isProcessing}
            className={`flex items-center gap-1.5 px-3 h-8 rounded-lg transition cursor-pointer ${
              isProcessing
                ? "text-text-tertiary opacity-50 cursor-not-allowed"
                : "text-accent-gold hover:bg-accent-gold/10"
            }`}
          >
            <Zap size={14} className={isProcessing ? "animate-pulse" : ""} />
            <span className="text-[11px] font-semibold">{isProcessing ? "처리중..." : "이벤트"}</span>
          </button>
        </div>
      </div>

      {/* ── Event input overlay ── */}
      {eventOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-[520px] max-w-[90vw] animate-slide-up">
          <div className="bg-surface-card border border-border-light rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] p-3">
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

const ACTIVE_STYLES: Record<string, string> = {
  "accent-green": "bg-accent-green/12 text-accent-green border border-accent-green/25",
  "accent-blue": "bg-accent-blue/12 text-accent-blue border border-accent-blue/25",
  "accent-gold": "bg-accent-gold/12 text-accent-gold border border-accent-gold/25",
};

function ToolbarBtn({
  onClick,
  active,
  icon: Icon,
  label,
  activeColor,
  badge = 0,
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ComponentType<any>;
  label: string;
  activeColor: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 h-8 rounded-lg transition cursor-pointer text-[11px] font-medium ${
        active
          ? ACTIVE_STYLES[activeColor] || ""
          : "text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary border border-transparent"
      }`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
      {badge > 0 && <Badge count={badge} />}
    </button>
  );
}
