"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, X, Sparkles, Newspaper, Lock } from "lucide-react";
import * as control from "@/lib/control";
import { EventCard } from "@/constants/cards";

interface Props {
  /** Session uid; the deck is per-session so we refetch once it resolves. */
  uid?: string;
  /** Inject the chosen card (or wildcard free-text) as the round's event. */
  onPick: (input: control.MarketEventInput) => void;
  onClose: () => void;
  /** Toggle map keyboard controls off while typing the wildcard. */
  onKeyboardEnabled?: (on: boolean) => void;
}

/**
 * FR-Branch: replaces the free-text event input with a Detroit-style choice —
 * 2-3 cascading cards (locks/unlocks the next round) plus one free-text wildcard.
 */
export default function CardPicker({ uid, onPick, onClose, onKeyboardEnabled }: Props) {
  const [cards, setCards] = useState<EventCard[]>([]);
  const [locked, setLocked] = useState<EventCard[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [wildcard, setWildcard] = useState(true);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");

  useEffect(() => {
    const sid = uid ?? control.loadSessionUid() ?? undefined;
    let alive = true;
    setLoading(true);
    control
      .getCards(sid)
      .then((r) => {
        if (!alive) return;
        setCards(r.cards ?? []);
        setLocked(r.locked ?? []);
        setRound(r.round ?? null);
        setWildcard(r.wildcard ?? true);
      })
      .catch((err) => console.warn("[MarketAquarium] getCards:", err))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [uid]);

  const pickCard = (card: EventCard) => {
    // Send only the event text + rumor flag + card id (for the deck cascade).
    // No impact/base_shock: the engine auto-classifies from text so price moves
    // emerge from agent emotion, not a pre-labelled 호재/악재 push.
    onPick({ text: card.text, card_id: card.id, is_rumor: card.is_rumor });
    onClose();
  };

  const submitWildcard = () => {
    const t = text.trim();
    if (!t) return;
    onPick({ text: t, is_rumor: false });
    setText("");
    onClose();
  };

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-[640px] max-w-[94vw] animate-slide-up">
      <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={14} className="text-pixel-greenText" />
          <span className="text-[11px] text-black font-bold tracking-wider">
            EVENT CARDS{round ? ` · 라운드 ${round}` : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-6 h-6 border-2 border-black rounded-lg bg-white flex items-center justify-center text-black hover:bg-pixel-danger hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-pixel-muted text-sm font-bold">
            <Loader2 size={18} className="animate-spin" />
            카드를 펼치는 중...
          </div>
        ) : cards.length === 0 && locked.length === 0 ? (
          <div className="py-6 text-center text-pixel-muted text-sm font-bold">
            제시할 카드가 없습니다. 아래 자유 이벤트로 진행하세요.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => pickCard(card)}
                className="group text-left bg-white border-2 border-black rounded-xl overflow-hidden hover:shadow-pixel-md cursor-pointer active:translate-x-[1px] active:translate-y-[1px] flex flex-col"
              >
                {/* Neutral header — no 호재/악재 hint; the player reads the crowd. */}
                <div className="h-1.5 border-b-2 border-black bg-pixel-path" />
                <div className="p-2.5 flex flex-col gap-1.5 grow">
                  <div className="flex items-center gap-1.5">
                    <span className="w-7 h-7 shrink-0 flex items-center justify-center border-2 border-black rounded-lg bg-pixel-path">
                      <Newspaper size={14} className="text-black" />
                    </span>
                    <span className="text-[12px] font-bold text-black leading-tight">
                      {card.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-pixel-muted leading-snug grow">
                    {card.text}
                  </p>
                  {card.is_rumor && (
                    <div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 border-2 border-black rounded-full bg-pixel-path text-black">
                        루머
                      </span>
                    </div>
                  )}
                </div>
              </button>
            ))}

            {/* Locked cards — closed off by the previous pick. Visible but not selectable. */}
            {locked.map((card) => (
              <div
                key={card.id}
                aria-disabled
                title="이전 선택으로 잠긴 카드입니다"
                className="relative text-left bg-pixel-wall border-2 border-dashed border-slate-400 rounded-xl overflow-hidden opacity-60 grayscale cursor-not-allowed flex flex-col"
              >
                {/* Lock overlay */}
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-black bg-white/85 border-2 border-black rounded-full px-2 py-0.5">
                    <Lock size={11} />
                    잠김
                  </span>
                </div>
                <div className="h-1.5 border-b-2 border-slate-400 bg-slate-300" />
                <div className="p-2.5 flex flex-col gap-1.5 grow">
                  <div className="flex items-center gap-1.5">
                    <span className="w-7 h-7 shrink-0 flex items-center justify-center border-2 border-slate-400 rounded-lg bg-slate-200">
                      <Lock size={13} className="text-slate-500" />
                    </span>
                    <span className="text-[12px] font-bold text-slate-500 leading-tight line-through">
                      {card.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug grow">
                    {card.text}
                  </p>
                  <div className="text-[9px] font-bold text-slate-400">
                    이전 선택으로 잠김
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Wildcard free-text */}
        {wildcard && (
          <div className="border-t-2 border-dashed border-slate-200 pt-2.5">
            <div className="text-[10px] text-pixel-muted font-bold mb-1.5 tracking-wider">
              와일드카드 · 직접 입력
            </div>
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") submitWildcard();
                }}
                onFocus={() => onKeyboardEnabled?.(false)}
                onBlur={() => onKeyboardEnabled?.(true)}
                placeholder="트럼프가 중국 반도체 관세를 예고했다..."
                className="flex-1 bg-white border-2 border-black rounded-lg px-3 py-2 text-sm text-black placeholder:text-pixel-muted focus:outline-none focus:bg-pixel-path"
              />
              <button
                onClick={submitWildcard}
                disabled={!text.trim()}
                className="px-4 py-2 bg-pixel-grass border-2 border-black rounded-lg text-black text-sm font-bold hover:brightness-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed active:translate-x-[1px] active:translate-y-[1px]"
              >
                <Send size={13} />
                <span>전송</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
