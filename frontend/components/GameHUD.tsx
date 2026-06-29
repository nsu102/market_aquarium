"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Clock,
  Play,
  Pause,
  Send,
  Zap,
  ZoomIn,
  ZoomOut,
  FileText,
} from "lucide-react";

interface Props {
  round: number;
  clock: string;
  playing?: boolean;
  onEvent: (text: string) => void;
  onToggleReport: () => void;
  reportOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onKeyboardEnabled?: (on: boolean) => void;
  onResume?: () => void;
  onStop?: () => void;
  forceEventOpen?: boolean;
  onOpenEvent?: () => void;
  gameFinished?: boolean;
}

const AUTO_SUBMIT_SEC = 5;

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

export default function GameHUD({
  round,
  clock,
  playing = false,
  onEvent,
  onToggleReport,
  reportOpen,
  onZoomIn,
  onZoomOut,
  onKeyboardEnabled,
  onResume,
  onStop,
  forceEventOpen,
  onOpenEvent,
  gameFinished,
}: Props) {
  const [eventText, setEventText] = useState("");
  const [countdown, setCountdown] = useState(AUTO_SUBMIT_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef = useRef<() => void>();

  const [placeholder, setPlaceholder] = useState(
    () => EVENT_PRESETS[Math.floor(Math.random() * EVENT_PRESETS.length)]
  );

  useEffect(() => {
    setPlaceholder(EVENT_PRESETS[Math.floor(Math.random() * EVENT_PRESETS.length)]);
  }, [round]);

  const submit = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const text = eventText.trim() || placeholder;
    onEvent(text);
    setEventText("");
    setCountdown(AUTO_SUBMIT_SEC);
    onKeyboardEnabled?.(true);
  }, [eventText, placeholder, onEvent, onKeyboardEnabled]);

  submitRef.current = submit;

  const isFirstRound = round === 0;

  // Auto-submit countdown when dialog opens (skip on first round)
  useEffect(() => {
    if (!forceEventOpen || isFirstRound) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    setCountdown(AUTO_SUBMIT_SEC);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          submitRef.current?.();
          return AUTO_SUBMIT_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [forceEventOpen, isFirstRound]);

  // Reset countdown when user types (they're engaged)
  useEffect(() => {
    if (forceEventOpen && !isFirstRound && eventText) setCountdown(AUTO_SUBMIT_SEC);
  }, [eventText, forceEventOpen, isFirstRound]);

  return (
    <>
      {/* ── Top-left: in-game day clock + round ── */}
      <div className="absolute left-4 z-40 top-4">
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

      {/* ── Bottom-left: Toolbar + speech-bubble dialog ── */}
      <div className="absolute bottom-5 left-4 z-40">
        {/* Speech-bubble dialog — pops up from the toolbar */}
        {forceEventOpen && (
          <div className="mb-2 relative">
            <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg w-[calc(100vw-2rem)] sm:w-[380px] overflow-hidden animate-pixel-pop">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-pixel-table border-b-2 border-black">
                <Zap size={13} className="text-black" />
                <span className="text-[10px] font-extrabold text-black tracking-wider">ROUND {round + 1}</span>
                {!isFirstRound && (
                  <span className="ml-auto text-[10px] font-bold text-pixel-muted tabular-nums">{countdown}s</span>
                )}
              </div>
              {/* Body */}
              <div className="p-3">
                <p className="text-[10px] text-pixel-muted mb-2">
                  {isFirstRound
                    ? "첫 이벤트를 입력하고 시작 버튼을 눌러주세요."
                    : `이벤트를 입력하세요. ${countdown}초 후 자동 전송됩니다.`}
                </p>
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
                    className="flex-1 bg-white border-2 border-black rounded-lg px-3 py-2 text-[12px] text-black placeholder:text-pixel-muted focus:outline-none focus:border-pixel-greenText focus:bg-pixel-path"
                  />
                  <button
                    onClick={submit}
                    className={`px-3 py-2 border-2 border-black rounded-lg text-[11px] font-bold hover:brightness-110 cursor-pointer flex items-center gap-1.5 active:translate-y-[1px] flex-shrink-0 ${
                      isFirstRound ? "bg-pixel-gold text-white" : "bg-pixel-grass text-black"
                    }`}
                  >
                    {isFirstRound ? <Play size={12} /> : <Send size={12} />}
                    {isFirstRound ? "시작" : "전송"}
                  </button>
                </div>
              </div>
            </div>
            {/* Speech bubble tail — bottom-right, pointing down */}
            <div className="absolute -bottom-[10px] right-8 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-black" />
            <div className="absolute -bottom-[7px] right-[34px] w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white" />
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 bg-white border-2 border-black rounded-2xl px-2 py-1.5 shadow-pixel-md">
          {/* Resume / Stop */}
          {playing ? (
            <button
              onClick={onStop}
              aria-label="일시정지"
              className="flex items-center gap-1.5 px-2.5 h-8 border-2 border-black rounded-lg bg-pixel-danger text-white font-bold hover:brightness-95 cursor-pointer text-[11px] active:translate-y-[1px]"
            >
              <Pause size={14} />
              <span className="hidden sm:inline">정지</span>
            </button>
          ) : (
            <button
              onClick={onResume}
              aria-label="재개"
              className="flex items-center gap-1.5 px-2.5 h-8 border-2 border-black rounded-lg bg-pixel-grass text-black font-bold hover:brightness-95 cursor-pointer text-[11px] active:translate-y-[1px]"
            >
              <Play size={14} />
              <span className="hidden sm:inline">재개</span>
            </button>
          )}

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Report */}
          <button
            onClick={onToggleReport}
            className={`flex items-center gap-1.5 px-2.5 h-8 border-2 border-black rounded-lg cursor-pointer text-[11px] font-bold active:translate-y-[1px] ${
              reportOpen ? "bg-pixel-path text-black" : "bg-white text-pixel-muted hover:bg-pixel-path hover:text-black"
            }`}
          >
            <FileText size={14} />
            <span className="hidden sm:inline">리포트</span>
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Zoom */}
          <button
            onClick={onZoomOut}
            aria-label="축소"
            className="w-8 h-8 border-2 border-black rounded-lg bg-white text-black hover:bg-pixel-path cursor-pointer flex items-center justify-center active:translate-y-[1px]"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={onZoomIn}
            aria-label="확대"
            className="w-8 h-8 border-2 border-black rounded-lg bg-white text-black hover:bg-pixel-path cursor-pointer flex items-center justify-center active:translate-y-[1px]"
          >
            <ZoomIn size={15} />
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1" />

          {/* Event trigger */}
          <button
            onClick={onOpenEvent}
            disabled={gameFinished}
            className={`flex items-center gap-1.5 px-3 h-8 border-2 border-black rounded-lg font-bold active:translate-y-[1px] ${
              gameFinished
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : forceEventOpen
                  ? "bg-pixel-gold text-white hover:brightness-95 cursor-pointer"
                  : "bg-pixel-grass text-black hover:brightness-95 cursor-pointer"
            }`}
          >
            <Zap size={14} />
            <span className="text-[11px]">{gameFinished ? "종료" : "이벤트"}</span>
          </button>
        </div>
      </div>
    </>
  );
}
