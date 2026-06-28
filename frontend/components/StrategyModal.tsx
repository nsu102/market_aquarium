"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Flame,
  Shield,
  Sparkles,
  Handshake,
  Swords,
  ShieldCheck,
  Scissors,
  TrendingUp,
  Repeat,
  Briefcase,
} from "lucide-react";
import PixelButton from "@/components/pixel/PixelButton";
import type { AgentOverride } from "@/lib/control";

/* ── Types ── */

interface Props {
  round: number;
  userAgent: {
    id: string;
    alias: string;
    fear: number;
    greed: number;
    confidence: number;
    excitement: number;
    trust: number;
    portfolio?: { asset: string; amount: number; avgPrice: number }[];
    cash?: number;
    sprite?: string;
  };
  onConfirm: (override: AgentOverride) => void;
  onKeyboardEnabled?: (on: boolean) => void;
}

/* ── Data ── */

const STRATEGY_PRESETS = [
  {
    label: "공격적 매수",
    desc: "저점을 노린다",
    icon: Swords,
    text: "시장이 공포에 빠졌을 때 과감하게 매수한다. 하락장에서 저점을 잡는 것이 목표다.",
    emotions: { fear: 20, greed: 85, confidence: 80, excitement: 75, trust: 60 },
    color: "#327A1C",
  },
  {
    label: "방어적 관망",
    desc: "현금 보존",
    icon: ShieldCheck,
    text: "리스크를 최소화하며 관망한다. 확실한 기회가 올 때까지 현금을 보존한다.",
    emotions: { fear: 60, greed: 25, confidence: 50, excitement: 20, trust: 40 },
    color: "#3B82F6",
  },
  {
    label: "손절 후 대기",
    desc: "손실 차단",
    icon: Scissors,
    text: "손실이 나는 포지션을 정리하고 현금 비중을 높인다. 하락이 멈출 때까지 기다린다.",
    emotions: { fear: 75, greed: 15, confidence: 30, excitement: 40, trust: 35 },
    color: "#6E4B12",
  },
  {
    label: "추세 추종",
    desc: "흐름을 탄다",
    icon: TrendingUp,
    text: "시장의 흐름을 따른다. 상승하면 매수, 하락하면 매도한다.",
    emotions: { fear: 40, greed: 65, confidence: 55, excitement: 60, trust: 50 },
    color: "#A8741A",
  },
  {
    label: "역발상",
    desc: "군중의 반대",
    icon: Repeat,
    text: "다수의 의견과 반대로 행동한다. 모두가 팔 때 사고, 모두가 살 때 판다.",
    emotions: { fear: 30, greed: 55, confidence: 75, excitement: 45, trust: 30 },
    color: "#8B5CF6",
  },
] as const;

const EMOTION_SLIDERS = [
  { key: "fear" as const, label: "공포", color: "#C0564A", icon: AlertTriangle },
  { key: "greed" as const, label: "탐욕", color: "#78F142", icon: Flame },
  { key: "confidence" as const, label: "자신감", color: "#3B82F6", icon: Shield },
  { key: "excitement" as const, label: "흥분", color: "#F59E0B", icon: Sparkles },
  { key: "trust" as const, label: "신뢰", color: "#8B5CF6", icon: Handshake },
] as const;

type EmotionKey = (typeof EMOTION_SLIDERS)[number]["key"];

/* ── Component ── */

export default function StrategyModal({ round, userAgent, onConfirm, onKeyboardEnabled }: Props) {
  const [emotions, setEmotions] = useState<Record<EmotionKey, number>>({
    fear: userAgent.fear, greed: userAgent.greed,
    confidence: userAgent.confidence, excitement: userAgent.excitement, trust: userAgent.trust,
  });
  const [strategyText, setStrategyText] = useState("");
  const [portfolioWeights, setPortfolioWeights] = useState<Record<string, number>>({});
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    setEmotions({
      fear: userAgent.fear, greed: userAgent.greed,
      confidence: userAgent.confidence, excitement: userAgent.excitement, trust: userAgent.trust,
    });
    if (userAgent.portfolio) {
      const total = (userAgent.cash ?? 0) + userAgent.portfolio.reduce((s, h) => s + h.amount * h.avgPrice, 0);
      const w: Record<string, number> = {};
      userAgent.portfolio.forEach((h) => {
        w[h.asset] = total > 0 ? Math.round((h.amount * h.avgPrice / total) * 100) : 0;
      });
      setPortfolioWeights(w);
    }
    setActivePreset(null);
    setStrategyText("");
  }, [userAgent]);

  const handlePreset = (preset: (typeof STRATEGY_PRESETS)[number]) => {
    setStrategyText(preset.text);
    setEmotions(preset.emotions);
    setActivePreset(preset.label);
  };

  const handleConfirm = () => {
    onKeyboardEnabled?.(true);
    onConfirm({
      agent_id: userAgent.id,
      ...emotions,
      strategy: strategyText.trim() || undefined,
      portfolio_weights: Object.keys(portfolioWeights).length > 0 ? portfolioWeights : undefined,
    });
  };

  const weightTotal = Object.values(portfolioWeights).reduce((s, v) => s + v, 0);

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg w-[520px] max-h-[88vh] flex flex-col animate-pixel-pop overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-3 bg-pixel-table border-b-2 border-black">
          <div className="w-9 h-9 rounded-full border-2 border-black bg-white overflow-hidden flex items-center justify-center">
            {userAgent.sprite ? (
              <Image
                src={userAgent.sprite.replace("/assets/characters/", "/assets/characters/profile/").replace(".png", ".png")}
                alt={userAgent.alias}
                width={28} height={28}
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div className="w-full h-full bg-[#E8A43A] flex items-center justify-center">
                <span className="text-white text-[11px] font-bold">{userAgent.alias[0]}</span>
              </div>
            )}
          </div>
          <div>
            <div className="text-[13px] font-extrabold text-black tracking-wide">
              ROUND {round + 1} 전략 설정
            </div>
            <div className="text-[10px] text-pixel-muted">{userAgent.alias}</div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Section 1: Strategy Presets */}
          <div className="px-5 pt-4 pb-3">
            <SectionTitle label="전략 프리셋" />
            <div className="grid grid-cols-5 gap-2 mt-2">
              {STRATEGY_PRESETS.map((p) => {
                const Icon = p.icon;
                const active = activePreset === p.label;
                return (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p)}
                    className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 cursor-pointer transition-colors active:translate-y-[1px] ${
                      active
                        ? "border-black bg-pixel-path shadow-pixel-sm"
                        : "border-slate-200 bg-white hover:border-black hover:bg-pixel-path"
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${p.color}18` }}
                    >
                      <Icon size={16} style={{ color: p.color }} />
                    </div>
                    <span className="text-[10px] font-bold text-black leading-tight text-center">{p.label}</span>
                    <span className="text-[8px] text-pixel-muted leading-tight">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Divider />

          {/* Section 2: Emotions */}
          <div className="px-5 py-3">
            <SectionTitle label="감정 상태" />
            <div className="mt-2 space-y-2.5">
              {EMOTION_SLIDERS.map(({ key, label, color, icon: Icon }) => {
                const val = emotions[key];
                const pct = Math.min(100, Math.max(0, val));
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}18` }}
                    >
                      <Icon size={12} style={{ color }} />
                    </div>
                    <span className="text-[10px] text-black font-bold w-9 flex-shrink-0">{label}</span>
                    <div className="flex-1 relative">
                      <input
                        type="range" min={0} max={100} value={val}
                        onChange={(e) => setEmotions((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        style={{
                          background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #E4E7EC ${pct}%, #E4E7EC 100%)`,
                        }}
                        className="w-full h-[7px] rounded-full border-2 border-black cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-pixel-sm"
                      />
                    </div>
                    <span className="text-[11px] font-bold w-7 text-right tabular-nums" style={{ color }}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Divider />

          {/* Section 3: Strategy text */}
          <div className="px-5 py-3">
            <SectionTitle label="전략 지시 (자유 입력)" />
            <textarea
              value={strategyText}
              onChange={(e) => { setStrategyText(e.target.value); setActivePreset(null); }}
              onKeyDown={(e) => e.stopPropagation()}
              onFocus={() => onKeyboardEnabled?.(false)}
              onBlur={() => onKeyboardEnabled?.(true)}
              placeholder="예: BTC가 하락하면 저점 매수, ETH는 비중 축소. 전체적으로 보수적으로 접근."
              rows={2}
              className="w-full mt-2 bg-white border-2 border-black rounded-xl px-3 py-2.5 text-[11px] text-black placeholder:text-pixel-muted focus:outline-none focus:border-pixel-greenText resize-none leading-relaxed"
            />
          </div>

          {/* Section 4: Portfolio weights */}
          {userAgent.portfolio && userAgent.portfolio.length > 0 && (
            <>
              <Divider />
              <div className="px-5 py-3 pb-4">
                <div className="flex items-center justify-between">
                  <SectionTitle label="포트폴리오 비중" icon={Briefcase} />
                  <span className={`text-[10px] font-bold tabular-nums ${
                    weightTotal > 100 ? "text-pixel-danger" : "text-pixel-muted"
                  }`}>
                    합계 {weightTotal}%
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {userAgent.portfolio.map((h) => {
                    const pct = Math.min(100, Math.max(0, portfolioWeights[h.asset] ?? 0));
                    return (
                      <div key={h.asset} className="flex items-center gap-2.5">
                        <span className="text-[10px] font-bold text-pixel-gold w-8 flex-shrink-0 tracking-wide">
                          {h.asset}
                        </span>
                        <input
                          type="range" min={0} max={100}
                          value={portfolioWeights[h.asset] ?? 0}
                          onChange={(e) => setPortfolioWeights((prev) => ({ ...prev, [h.asset]: Number(e.target.value) }))}
                          style={{
                            background: `linear-gradient(to right, #E8A43A 0%, #E8A43A ${pct}%, #E4E7EC ${pct}%, #E4E7EC 100%)`,
                          }}
                          className="flex-1 h-[6px] rounded-full border-2 border-black cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:cursor-pointer"
                        />
                        <span className="text-[10px] font-bold w-7 text-right tabular-nums text-pixel-gold">
                          {portfolioWeights[h.asset] ?? 0}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t-2 border-black flex items-center justify-between bg-pixel-path">
          <span className="text-[9px] text-pixel-muted">
            전략을 설정한 뒤 확인을 눌러주세요
          </span>
          <PixelButton onClick={handleConfirm} size="md">
            확인
          </PixelButton>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function SectionTitle({ label, icon: Icon }: { label: string; icon?: React.ComponentType<any> }) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon size={12} className="text-pixel-gold" />}
      <span className="text-[11px] font-bold text-black">{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="mx-5 border-t border-slate-200" />;
}
