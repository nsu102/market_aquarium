"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  BarChart3,
  MessageSquare,
  Zap,
  ZoomIn,
  ZoomOut,
  FileText,
} from "lucide-react";
import CardPicker from "@/components/CardPicker";
import type { MarketEventInput } from "@/lib/control";

interface Props {
  round: number;
  /** Session uid, threaded to the card picker so its deck fetch is per-session. */
  uid?: string;
  /** In-game clock label "HH:MM" (00:00 → 24:00) shown in the logo slot. */
  clock: string;
  /** True while the day is replaying (clock advancing). */
  playing?: boolean;
  onEvent: (input: MarketEventInput) => void;
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
  onKeyboardEnabled?: (on: boolean) => void;
  /** Force-open the event input (e.g. after round end). */
  forceEventOpen?: boolean;
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  const display = count > 99 ? "99+" : count;
  return (
    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-pixel-danger text-white text-[9px] font-bold border-2 border-black rounded-full flex items-center justify-center leading-none">
      {display}
    </span>
  );
}

export default function GameHUD({
  round,
  uid,
  clock,
  playing = false,
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
  onKeyboardEnabled,
  forceEventOpen,
}: Props) {
  const [eventOpen, setEventOpen] = useState(false);

  useEffect(() => {
    if (forceEventOpen) setEventOpen(true);
  }, [forceEventOpen]);

  const closeEvent = () => {
    setEventOpen(false);
    onKeyboardEnabled?.(true);
  };

  return (
    <>
      {/* ── Top-left: in-game day clock + round ── */}
      <div className="absolute top-4 left-4 z-40">
        <div className="flex items-center gap-2.5 bg-white border-2 border-black rounded-xl px-3 py-2 shadow-pixel-sm">
          <Clock
            size={18}
            className={`text-pixel-greenText ${playing ? "animate-pulse-soft" : ""}`}
          />
          <span className="text-lg font-extrabold text-black tracking-wider tabular-nums leading-none pixel-title">
            {clock}
          </span>
          <span className="text-[10px] font-bold text-pixel-muted leading-none">
            DAY {round}
          </span>
        </div>
      </div>

      {/* ── Bottom-left: Toolbar ── */}
      <div className="absolute bottom-5 left-4 z-40">
        <div className="flex items-center gap-1 bg-white border-2 border-black rounded-2xl px-2 py-1.5 shadow-pixel-md">
          <ToolbarBtn
            onClick={onToggleMarket}
            active={marketOpen}
            icon={BarChart3}
            label="시장"
            activeBg="bg-pixel-grass"
            badge={!marketOpen ? marketNotifications : 0}
          />
          <ToolbarBtn
            onClick={onToggleBoard}
            active={boardOpen}
            icon={MessageSquare}
            label="게시판"
            activeBg="bg-pixel-water"
            badge={!boardOpen ? boardNotifications : 0}
          />
          <ToolbarBtn
            onClick={onToggleReport}
            active={reportOpen}
            icon={FileText}
            label="리포트"
            activeBg="bg-pixel-path"
          />

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Round display */}
          <div className="flex items-center gap-1 px-1">
            <span className="text-[10px] text-pixel-muted font-bold">R</span>
            <span className="text-pixel-greenText font-bold text-sm min-w-[16px] text-center">
              {round}
            </span>
          </div>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Zoom */}
          <button
            onClick={onZoomOut}
            aria-label="축소"
            className="w-8 h-8 border-2 border-black rounded-lg bg-white text-black hover:bg-pixel-path cursor-pointer flex items-center justify-center active:translate-x-[1px] active:translate-y-[1px]"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={onZoomIn}
            aria-label="확대"
            className="w-8 h-8 border-2 border-black rounded-lg bg-white text-black hover:bg-pixel-path cursor-pointer flex items-center justify-center active:translate-x-[1px] active:translate-y-[1px]"
          >
            <ZoomIn size={15} />
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Event trigger */}
          <button
            onClick={() => setEventOpen(true)}
            className="flex items-center gap-1.5 px-3 h-8 border-2 border-black rounded-lg bg-pixel-grass text-black font-bold hover:brightness-95 cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Zap size={14} />
            <span className="text-[11px]">이벤트</span>
          </button>
        </div>
      </div>

      {/* ── Event card picker (FR-Branch) ── */}
      {eventOpen && (
        <CardPicker
          uid={uid}
          onPick={onEvent}
          onClose={closeEvent}
          onKeyboardEnabled={onKeyboardEnabled}
        />
      )}
    </>
  );
}

function ToolbarBtn({
  onClick,
  active,
  icon: Icon,
  label,
  activeBg,
  badge = 0,
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ComponentType<any>;
  label: string;
  activeBg: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 h-8 border-2 rounded-lg cursor-pointer text-[11px] font-bold active:translate-x-[1px] active:translate-y-[1px] ${active
        ? `${activeBg} text-black border-black`
        : "bg-white text-pixel-muted border-black hover:bg-pixel-path hover:text-black"
        }`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
      {badge > 0 && <Badge count={badge} />}
    </button>
  );
}
