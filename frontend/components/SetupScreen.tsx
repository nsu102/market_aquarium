"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Agent } from "@/mock_data/agents";
import { Asset } from "@/mock_data/market";
import { AGENT_PROFILES, DEFAULT_ASSETS, CHARACTER_POOL, CUSTOM_COLORS } from "@/constants/agentProfiles";
import { seedPriceHistory } from "@/utils/sparkline";
import {
  Play,
  Plus,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  RotateCcw,
  Fish,
  Briefcase,
  Sliders,
  AlertTriangle,
  Flame,
  X,
  Eye,
  EyeOff,
  Shield,
  Coins,
  TrendingUp,
  Trash2,
  UserPlus,
} from "lucide-react";
import { filterNumeric, filterInt, formatKRW } from "@/utils/numberInput";
import PixelButton from "@/components/pixel/PixelButton";

/* ── Types ── */

interface SetupAgent {
  id: string;
  alias: string;
  type: string;
  cash: number;
  portfolio: { asset: string; amount: number; avgPrice: number }[];
  fear: number;
  greed: number;
  color: string;
  enabled: boolean;
  sprite: string;
  profile: string;
  traits: string[];
  description: string;
}

interface Props {
  onStart: (agents: Agent[], assets: Asset[]) => void;
}

/* ── Helpers ── */

const CASH_PRESETS = [100000, 500000, 1000000, 5000000, 10000000, 50000000, 100000000, 500000000];

function buildDefault(): SetupAgent[] {
  return AGENT_PROFILES.map((p) => ({
    id: p.id, alias: p.alias, type: p.type, cash: p.defaultCash,
    portfolio: [], fear: p.defaultFear, greed: p.defaultGreed, color: p.color, enabled: true,
    sprite: p.sprite, profile: p.profile, traits: p.traits, description: p.description,
  }));
}

/* ── Component ── */

export default function SetupScreen({ onStart }: Props) {
  const [agents, setAgents] = useState<SetupAgent[]>(buildDefault);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editingAsset, setEditingAsset] = useState<string | null>(null);

  const selected = agents[selectedIdx];
  const enabledAgents = agents.filter((a) => a.enabled);

  const updateAgent = (patch: Partial<SetupAgent>) => {
    setAgents((prev) => prev.map((a, i) => (i === selectedIdx ? { ...a, ...patch } : a)));
  };

  const addPortfolioItem = () => {
    const available = DEFAULT_ASSETS.filter((ea) => !selected.portfolio.some((p) => p.asset === ea.symbol));
    if (available.length === 0) return;
    const asset = available[0];
    updateAgent({ portfolio: [...selected.portfolio, { asset: asset.symbol, amount: 0, avgPrice: asset.price }] });
  };

  const removePortfolioItem = (asset: string) => {
    updateAgent({ portfolio: selected.portfolio.filter((p) => p.asset !== asset) });
  };

  const updatePortfolioItem = (asset: string, patch: { amount?: number; avgPrice?: number }) => {
    updateAgent({ portfolio: selected.portfolio.map((p) => (p.asset === asset ? { ...p, ...patch } : p)) });
  };

  const randomize = () => {
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        cash: Math.round(a.cash * (0.3 + Math.random() * 1.4) || 5000000),
        fear: Math.round(Math.random() * 100),
        greed: Math.round(Math.random() * 100),
        portfolio: DEFAULT_ASSETS.filter(() => Math.random() > 0.5).map((ea) => ({
          asset: ea.symbol,
          amount: +(Math.random() * (ea.price > 1e6 ? 1 : 100)).toFixed(ea.price > 1e6 ? 4 : 2),
          avgPrice: Math.round(ea.price * (0.8 + Math.random() * 0.4)),
        })),
      }))
    );
  };

  const addAgent = () => {
    if (agents.length >= 25) return;
    const usedSprites = new Set(agents.map((a) => a.sprite));
    const available = CHARACTER_POOL.filter(
      (c) => !usedSprites.has(`/assets/characters/${c.name}.png`)
    );
    if (available.length === 0) return;
    const char = available[0];
    const idx = agents.length;
    const maxNum = agents.reduce((max, a) => {
      const m = a.alias.match(/^투자자\s*(\d+)$/);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    const randomPortfolio = DEFAULT_ASSETS
      .filter(() => Math.random() > 0.5)
      .map((ea) => ({
        asset: ea.symbol,
        amount: +(Math.random() * (ea.price > 1e6 ? 1 : 100)).toFixed(ea.price > 1e6 ? 4 : 2),
        avgPrice: Math.round(ea.price * (0.8 + Math.random() * 0.4)),
      }));
    const newAgent: SetupAgent = {
      id: `custom_${Date.now()}`,
      alias: `투자자 ${maxNum + 1}`,
      type: "custom",
      cash: Math.round(5000000 + Math.random() * 45000000),
      portfolio: randomPortfolio,
      fear: Math.round(20 + Math.random() * 60),
      greed: Math.round(20 + Math.random() * 60),
      color: CUSTOM_COLORS[idx % CUSTOM_COLORS.length],
      enabled: true,
      sprite: `/assets/characters/${char.name}.png`,
      profile: `/assets/characters/profile/${char.name}.png`,
      traits: ["커스텀"],
      description: "사용자가 추가한 에이전트입니다.",
    };
    setAgents((prev) => [...prev, newAgent]);
    setSelectedIdx(agents.length);
  };

  const removeAgent = (idx: number) => {
    if (agents.length <= 2) return;
    setAgents((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx((prev) => Math.min(prev, agents.length - 2));
  };

  const reset = () => { setAgents(buildDefault()); setSelectedIdx(0); };

  const nav = (dir: -1 | 1) => {
    setSelectedIdx((i) => Math.max(0, Math.min(agents.length - 1, i + dir)));
  };

  const handleStart = () => {
    const finalAgents: Agent[] = enabledAgents.map((a) => ({
      id: a.id, alias: a.alias, type: a.type, sprite: a.sprite, cash: Math.round(a.cash), portfolio: a.portfolio,
      fear: a.fear, greed: a.greed, lastAction: "대기", location: "home" as const,
      position: { x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 }, bubble: "", color: a.color,
    }));
    const finalAssets: Asset[] = DEFAULT_ASSETS.map((a) => ({
      symbol: a.symbol, name: a.name, price: a.price, change24h: 0, volume: 0,
      priceHistory: seedPriceHistory(a.symbol, a.price),
    }));
    onStart(finalAgents, finalAssets);
  };

  const totalValue = useMemo(() => {
    let sum = Math.round(selected.cash);
    selected.portfolio.forEach((p) => {
      const asset = DEFAULT_ASSETS.find((a) => a.symbol === p.asset);
      if (asset) sum += Math.round(p.amount * asset.price);
    });
    return sum;
  }, [selected]);

  // 보유 현금 게이지 채움 비율(0~100%) — 슬라이더 최대치 = 최고 프리셋(5억)과 동일.
  const CASH_MAX = CASH_PRESETS[CASH_PRESETS.length - 1];
  const cashPct = Math.min(100, Math.max(0, (selected.cash / CASH_MAX) * 100));

  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden select-none relative bg-surface-primary">
      {/* Background */}
      <Image src="/assets/bg.png" alt="" fill className="object-cover opacity-30" style={{ imageRendering: "pixelated" }} priority />
      <div className="absolute inset-0 bg-slate-900/60" />

      {/* ═══ Window ═══ */}
      <div className="relative z-10 flex flex-col w-[860px] h-[560px] max-w-[92vw] max-h-[88vh] mx-auto overflow-hidden border-2 border-black rounded-2xl shadow-pixel-lg">

        {/* Title bar */}
        <div className="h-10 bg-pixel-table border-b-2 border-black flex items-center px-4 gap-3 flex-shrink-0">
          <Fish size={14} className="text-black" />
          <span className="text-[12px] font-bold text-black tracking-wide pixel-title">PREPARE CAREFULLY</span>
          <div className="flex-1" />
          <span className="text-[10px] text-black font-bold">
            {enabledAgents.length} / {agents.length}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden bg-white">

          {/* Left: list */}
          <div className="w-[160px] flex-shrink-0 border-r-2 border-black flex flex-col bg-white">
            <div className="px-3 py-2 border-b-2 border-black">
              <div className="text-[9px] text-pixel-gold tracking-[0.2em] font-bold">COLONY</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {agents.map((agent, idx) => {
                const sel = idx === selectedIdx;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-2 px-2 py-[7px] text-left cursor-pointer border-l-4 ${
                      sel ? "bg-pixel-path border-pixel-gold" : "border-transparent hover:bg-pixel-path"
                    } ${!agent.enabled ? "opacity-30" : ""}`}
                  >
                    <div className="w-7 h-7 border-2 border-black rounded-lg bg-white overflow-hidden flex items-center justify-center flex-shrink-0">
                      <Image src={agent.profile} alt="" width={22} height={22} style={{ imageRendering: "pixelated" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-black truncate leading-tight">{agent.alias}</div>
                      <div className="text-[8px] text-pixel-muted truncate">{agent.type}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Add agent */}
            {agents.length < 25 && (
              <button
                onClick={addAgent}
                className="flex items-center justify-center gap-1 py-2 border-t-2 border-black text-[9px] text-pixel-muted hover:text-pixel-gold hover:bg-pixel-path cursor-pointer font-bold"
              >
                <UserPlus size={10} />
                <span>추가 ({agents.length}/25)</span>
              </button>
            )}
          </div>

          {/* Center: portrait */}
          <div className="w-[220px] flex-shrink-0 border-r-2 border-black flex flex-col bg-white">
            <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
              <button
                onClick={() => updateAgent({ enabled: !selected.enabled })}
                className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-[3px] text-[9px] font-bold cursor-pointer border-2 border-black rounded-full ${
                  selected.enabled ? "bg-pixel-grass text-black" : "bg-white text-pixel-muted"
                }`}
              >
                {selected.enabled ? <Eye size={9} /> : <EyeOff size={9} />}
                {selected.enabled ? "참여" : "제외"}
              </button>

              {/* Portrait */}
              <div className="w-[104px] h-[104px] bg-white border-2 border-black rounded-xl flex items-center justify-center mb-3">
                <Image src={selected.profile} alt="" width={68} height={68} style={{ imageRendering: "pixelated" }} />
              </div>

              {/* Nav */}
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => nav(-1)} disabled={selectedIdx === 0} aria-label="이전" className="text-pixel-muted hover:text-pixel-gold disabled:opacity-20 cursor-pointer"><ChevronLeft size={14} /></button>
                <div className="bg-white border-2 border-black rounded-lg px-3 py-1 min-w-[110px] text-center">
                  <span className="text-[12px] font-bold text-black">{selected.alias}</span>
                </div>
                <button onClick={() => nav(1)} disabled={selectedIdx === agents.length - 1} aria-label="다음" className="text-pixel-muted hover:text-pixel-gold disabled:opacity-20 cursor-pointer"><ChevronRight size={14} /></button>
              </div>

              <p className="text-[9px] text-pixel-muted text-center leading-[1.5] max-w-[180px]">{selected.description}</p>
            </div>

            {/* Traits + Delete */}
            <div className="px-3 pb-3">
              <Hdr title="특징" icon={Shield} />
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selected.traits.map((t) => (
                  <span key={t} className="inline-flex items-center bg-white border-2 border-black rounded-full px-2.5 py-[3px] text-[10px] text-black font-medium leading-none">
                    {t}
                  </span>
                ))}
              </div>
              {agents.length > 2 && (
                <button
                  onClick={() => removeAgent(selectedIdx)}
                  className="w-full flex items-center justify-center gap-1 py-[5px] border-2 border-black rounded-lg bg-pixel-danger text-white text-[9px] font-bold hover:brightness-90 cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
                >
                  <Trash2 size={10} />삭제
                </button>
              )}
            </div>
          </div>

          {/* Right: stats */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="p-4 space-y-3">

              {/* Cash */}
              <div>
                <Hdr title="보유 현금" icon={Coins} />
                <Panel>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="range" min={0} max={CASH_MAX} step={1000000} value={selected.cash} onChange={(e) => updateAgent({ cash: Number(e.target.value) })}
                      style={{ background: `linear-gradient(to right, #A8741A 0%, #A8741A ${cashPct}%, #E4E7EC ${cashPct}%, #E4E7EC 100%)` }}
                      className="flex-1 h-[8px] rounded-full border-2 border-black cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pixel-gold [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:cursor-pointer" />
                    <input type="text" value={Math.round(selected.cash).toLocaleString()} onChange={(e) => updateAgent({ cash: filterInt(e.target.value) })}
                      className="w-24 text-right text-[11px] font-bold text-black bg-white border-2 border-black rounded-lg px-2 py-[3px] focus:outline-none focus:bg-pixel-path" />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {CASH_PRESETS.map((v) => (
                      <button key={v} onClick={() => updateAgent({ cash: v })}
                        className={`px-1.5 py-[2px] text-[8px] font-bold cursor-pointer border-2 border-black rounded-md ${
                          Math.round(selected.cash) === v ? "bg-pixel-gold text-white" : "bg-white text-pixel-muted hover:text-black"
                        }`}>{formatKRW(v)}</button>
                    ))}
                  </div>
                </Panel>
              </div>

              {/* Personality */}
              <div>
                <Hdr title="성격" icon={Sliders} />
                <Panel className="space-y-3">
                  <Stat label="공포" value={selected.fear} onChange={(v) => updateAgent({ fear: v })} color="#C0564A" icon={AlertTriangle} />
                  <Stat label="탐욕" value={selected.greed} onChange={(v) => updateAgent({ greed: v })} color="#78F142" icon={Flame} />
                </Panel>
              </div>

              {/* Portfolio */}
              <div>
                <Hdr title="포트폴리오" icon={Briefcase} />
                <Panel>
                  {selected.portfolio.length > 0 ? (
                    <div className="space-y-1 mb-2">
                      {selected.portfolio.map((item) => {
                        const assetInfo = DEFAULT_ASSETS.find((a) => a.symbol === item.asset);
                        const currentPrice = assetInfo?.price ?? 0;
                        const totalVal = item.amount * currentPrice;
                        return (
                          <button
                            key={item.asset}
                            onClick={() => setEditingAsset(item.asset)}
                            className="w-full flex items-center gap-2 bg-white border-2 border-black rounded-lg px-2.5 py-[7px] cursor-pointer hover:bg-pixel-path text-left group"
                          >
                            <span className="text-[11px] font-bold text-pixel-gold w-9">{item.asset}</span>
                            <span className="text-[8px] text-pixel-muted flex-1 truncate">{assetInfo?.name}</span>
                            <span className="text-[9px] text-black">{item.amount > 0 ? item.amount : "-"}</span>
                            <span className="text-[8px] text-pixel-muted">{totalVal > 0 ? formatKRW(Math.round(totalVal)) : ""}</span>
                            <ChevronRight size={10} className="text-pixel-muted group-hover:text-pixel-gold" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-2.5 text-pixel-muted text-[9px]">보유 종목 없음</div>
                  )}
                  {selected.portfolio.length < DEFAULT_ASSETS.length && (
                    <button onClick={addPortfolioItem} className="w-full flex items-center justify-center gap-1 py-[5px] border-2 border-dashed border-black/40 rounded-lg text-[9px] text-pixel-muted hover:border-pixel-gold hover:text-pixel-gold cursor-pointer">
                      <Plus size={10} />추가
                    </button>
                  )}
                </Panel>
              </div>

              {/* Summary */}
              <Panel>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[13px] font-bold text-pixel-gold">{formatKRW(Math.round(selected.cash))}</div>
                    <div className="text-[7px] text-pixel-muted mt-px tracking-wider">현금</div>
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-black">{formatKRW(totalValue)}</div>
                    <div className="text-[7px] text-pixel-muted mt-px tracking-wider">총 자산</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[11px] font-bold text-pixel-danger">{selected.fear}</span>
                      <span className="text-[8px] text-pixel-muted">/</span>
                      <span className="text-[11px] font-bold text-pixel-greenText">{selected.greed}</span>
                    </div>
                    <div className="text-[7px] text-pixel-muted mt-px tracking-wider">공포 / 탐욕</div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="h-12 bg-white border-t-2 border-black flex items-center px-4 gap-2 flex-shrink-0">
          <PixelButton variant="ghost" size="sm" onClick={randomize}><Shuffle size={11} />랜덤</PixelButton>
          <PixelButton variant="ghost" size="sm" onClick={reset}><RotateCcw size={11} />초기화</PixelButton>
          <div className="flex-1" />
          <PixelButton variant="primary" size="md" onClick={handleStart} disabled={enabledAgents.length < 2}>
            시작<Play size={12} />
          </PixelButton>
        </div>
      </div>

      {/* ═══ Portfolio Detail Modal ═══ */}
      {editingAsset && (() => {
        const item = selected.portfolio.find((p) => p.asset === editingAsset);
        if (!item) return null;
        const assetInfo = DEFAULT_ASSETS.find((a) => a.symbol === item.asset);
        const currentPrice = assetInfo?.price ?? 0;
        const totalVal = item.amount * currentPrice;
        const pnl = currentPrice && item.avgPrice ? ((currentPrice - item.avgPrice) / item.avgPrice * 100) : 0;
        const avgCost = item.amount * item.avgPrice;

        return (
          <>
            <div className="absolute inset-0 z-30 bg-slate-900/50" onClick={() => setEditingAsset(null)} />
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto w-[320px] bg-white border-2 border-black rounded-2xl shadow-pixel-lg animate-pixel-pop overflow-hidden">

                {/* Modal header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-pixel-table border-b-2 border-black">
                  <div className="flex items-center gap-2">
                    <Briefcase size={13} className="text-black" />
                    <span className="text-[12px] font-bold text-black">{item.asset}</span>
                    <span className="text-[9px] text-black/70">{assetInfo?.name}</span>
                  </div>
                  <button
                    onClick={() => setEditingAsset(null)}
                    aria-label="닫기"
                    className="w-6 h-6 border-2 border-black rounded-lg bg-white flex items-center justify-center text-black hover:bg-pixel-danger hover:text-white cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Modal body */}
                <div className="p-4 space-y-3 bg-white">
                  <div className="bg-pixel-path border-2 border-black rounded-lg p-3">
                    <div className="text-[8px] text-pixel-muted tracking-wider mb-1 font-bold">현재 시세</div>
                    <div className="text-[16px] font-bold text-black">{formatKRW(currentPrice)}</div>
                  </div>

                  <div>
                    <div className="text-[9px] text-pixel-muted mb-1.5 font-bold">보유 수량</div>
                    <input
                      type="text"
                      value={item.amount || ""}
                      onChange={(e) => updatePortfolioItem(item.asset, { amount: filterNumeric(e.target.value) })}
                      placeholder="0"
                      className="w-full text-[13px] text-black bg-white border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:bg-pixel-path"
                    />
                  </div>

                  <div>
                    <div className="text-[9px] text-pixel-muted mb-1.5 font-bold">평균 매수가</div>
                    <input
                      type="text"
                      value={item.avgPrice ? item.avgPrice.toLocaleString() : ""}
                      onChange={(e) => updatePortfolioItem(item.asset, { avgPrice: filterInt(e.target.value) })}
                      placeholder="0"
                      className="w-full text-[13px] text-black bg-white border-2 border-black rounded-lg px-3 py-2 focus:outline-none focus:bg-pixel-path"
                    />
                  </div>

                  <div className="bg-pixel-path border-2 border-black rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[7px] text-pixel-muted tracking-wider mb-0.5 font-bold">매수 금액</div>
                        <div className="text-[11px] font-bold text-black">{formatKRW(Math.round(avgCost))}</div>
                      </div>
                      <div>
                        <div className="text-[7px] text-pixel-muted tracking-wider mb-0.5 font-bold">평가 금액</div>
                        <div className="text-[11px] font-bold text-black">{formatKRW(Math.round(totalVal))}</div>
                      </div>
                      <div>
                        <div className="text-[7px] text-pixel-muted tracking-wider mb-0.5 font-bold">평가 손익</div>
                        <div className={`text-[11px] font-bold ${(totalVal - avgCost) >= 0 ? "text-pixel-greenText" : "text-pixel-danger"}`}>
                          {(totalVal - avgCost) >= 0 ? "+" : ""}{formatKRW(Math.round(totalVal - avgCost))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[7px] text-pixel-muted tracking-wider mb-0.5 font-bold">수익률</div>
                        <div className={`text-[11px] font-bold flex items-center gap-0.5 ${pnl >= 0 ? "text-pixel-greenText" : "text-pixel-danger"}`}>
                          <TrendingUp size={10} />
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal footer */}
                <div className="flex items-center justify-between px-4 py-3 bg-pixel-wall border-t-2 border-black">
                  <PixelButton variant="danger" size="sm" onClick={() => { removePortfolioItem(item.asset); setEditingAsset(null); }}>
                    <X size={10} />삭제
                  </PixelButton>
                  <PixelButton variant="primary" size="sm" onClick={() => setEditingAsset(null)}>
                    확인
                  </PixelButton>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

/* ══════════ Sub-components ══════════ */

function Hdr({ title, icon: Icon }: { title: string; icon: React.ComponentType<any> }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={11} className="text-pixel-gold" />
      <span className="text-[10px] text-black font-bold">{title}</span>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border-2 border-black rounded-xl p-3 ${className}`}>{children}</div>;
}

function Stat({ label, value, onChange, color, icon: Icon }: {
  label: string; value: number; onChange: (v: number) => void; color: string; icon: React.ComponentType<any>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-pixel-muted flex items-center gap-1 font-bold">
          <Icon size={10} style={{ color }} />{label}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(Math.max(0, value - 5))} aria-label="감소" className="w-[16px] h-[16px] bg-white border-2 border-black rounded-md flex items-center justify-center text-pixel-muted hover:text-black cursor-pointer"><ChevronLeft size={8} /></button>
          <span className="text-[11px] font-bold w-6 text-center" style={{ color }}>{value}</span>
          <button onClick={() => onChange(Math.min(100, value + 5))} aria-label="증가" className="w-[16px] h-[16px] bg-white border-2 border-black rounded-md flex items-center justify-center text-pixel-muted hover:text-black cursor-pointer"><ChevronRight size={8} /></button>
        </div>
      </div>
      <div className="h-[6px] bg-pixel-path border-2 border-black rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
