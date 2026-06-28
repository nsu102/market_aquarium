"use client";

import { useState, useEffect } from "react";
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
  const [eventText, setEventText] = useState("");

  // ponytail: preset event pool — random placeholder shown each time
  const EVENT_PRESETS = [
    "미 연준이 기준금리를 0.25%p 인상했다",
    "트럼프가 중국산 반도체에 25% 관세를 발표했다",
    "SEC가 주요 거래소를 상대로 소송을 제기했다",
    "비트코인 ETF 일일 순유입 $1B 돌파",
    "테더(USDT)의 준비금 감사 보고서가 공개되었다",
    "이더리움 네트워크 대규모 업그레이드 완료",
    "일본 중앙은행이 마이너스 금리를 종료했다",
    "대형 거래소에서 해킹으로 $200M 유출",
    "엘살바도르가 비트코인 법정화폐 정책을 철회했다",
    "블랙록이 이더리움 ETF 신청서를 제출했다",
    "중국 인민은행이 대규모 유동성을 공급했다",
    "미국 CPI가 예상치를 크게 상회했다",
    "유명 인플루언서가 밈코인 러그풀로 기소되었다",
    "마이크로스트래티지가 BTC 10,000개 추가 매입",
    "EU가 암호화폐 규제 프레임워크를 확정했다",
    "솔라나 네트워크가 6시간 동안 다운되었다",
    "페이팔이 스테이블코인 결제를 전면 확대했다",
    "미국 실업률이 예상 밖으로 급등했다",
    "바이낸스 CEO가 사임을 발표했다",
    "비트코인 반감기가 한 달 앞으로 다가왔다",
  ];

  const [placeholder] = useState(
    () => EVENT_PRESETS[Math.floor(Math.random() * EVENT_PRESETS.length)]
  );

  const closeEvent = () => {
    setEventOpen(false);
    onKeyboardEnabled?.(true);
  };

  const submit = () => {
    const text = eventText.trim() || placeholder;
    onEvent(text);
    setEventText("");
    closeEvent();
  };

  return (
    <>
      {/* ── Top-left: Logo ── */}
      <div className="absolute top-4 left-4 z-40">
        <div className="flex items-center gap-2 bg-white border-2 border-black rounded-xl px-3 py-2 shadow-pixel-sm">
          <Fish size={18} className="text-pixel-greenText" />
          <span className="text-sm font-bold text-black tracking-wide pixel-title">
            MARKET AQUARIUM
          </span>
        </div>
      </div>

      {/* ── Bottom-center: Toolbar ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40">
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

      {/* ── Event input overlay ── */}
      {eventOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-[520px] max-w-[90vw] animate-slide-up">
          <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-pixel-greenText" />
              <span className="text-[11px] text-black font-bold tracking-wider">GLOBAL EVENT</span>
              <div className="flex-1" />
              <button
                onClick={closeEvent}
                aria-label="닫기"
                className="w-6 h-6 border-2 border-black rounded-lg bg-white flex items-center justify-center text-black hover:bg-pixel-danger hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={eventText}
                onChange={(e) => setEventText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") submit();
                }}
                onFocus={() => onKeyboardEnabled?.(false)}
                onBlur={() => onKeyboardEnabled?.(true)}
                placeholder={placeholder}
                autoFocus
                className="flex-1 bg-white border-2 border-black rounded-lg px-3 py-2 text-sm text-black placeholder:text-pixel-muted focus:outline-none focus:bg-pixel-path"
              />
              <button
                onClick={submit}
                className="px-4 py-2 bg-pixel-grass border-2 border-black rounded-lg text-black text-sm font-bold hover:brightness-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed active:translate-x-[1px] active:translate-y-[1px]"
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
      className={`relative flex items-center gap-1.5 px-2.5 h-8 border-2 rounded-lg cursor-pointer text-[11px] font-bold active:translate-x-[1px] active:translate-y-[1px] ${
        active
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
