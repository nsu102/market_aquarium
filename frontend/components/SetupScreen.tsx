"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Agent } from "@/mock_data/agents";
import { Asset } from "@/mock_data/market";
import { AGENT_PROFILES, DEFAULT_ASSETS, CHARACTER_POOL, CUSTOM_COLORS } from "@/constants/agentProfiles";
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
    // ponytail: 기존 alias에서 최대 번호 추출해서 중복 방지
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
      symbol: a.symbol, name: a.name, price: a.price, change24h: 0, volume: 0, priceHistory: [a.price],
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

  return (
    <div className="h-screen w-screen flex items-center justify-center overflow-hidden select-none relative bg-[#1a1612]">
      {/* Background */}
      <Image src="/assets/bg.png" alt="" fill className="object-cover opacity-40" style={{ imageRendering: "pixelated" }} priority />
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1612]/60 via-[#1a1612]/30 to-[#1a1612]/70" />
      {/* ═══ Modal ═══ */}
      <div className="relative z-10 flex flex-col w-[860px] h-[560px] max-w-[92vw] max-h-[88vh] mx-auto rounded-lg overflow-hidden shadow-[0_8px_60px_rgba(0,0,0,0.7)] border border-[#3d3428]/50">

        {/* Title bar */}
        <div className="h-10 bg-[#13100d] border-b border-[#3d3428]/50 flex items-center px-4 gap-3 flex-shrink-0">
          <Fish size={14} className="text-[#c8a84e]" />
          <span className="text-[12px] font-bold text-[#e8dcc8] tracking-wide">Prepare Carefully</span>
          <div className="flex-1" />
          <span className="text-[9px] text-[#4a4238] font-mono">
            {enabledAgents.length} / {agents.length}
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden bg-[#1a1612]">

          {/* Left: list */}
          <div className="w-[160px] flex-shrink-0 border-r border-[#2a2318] flex flex-col bg-[#15120f]">
            <div className="px-3 py-2 border-b border-[#2a2318]">
              <div className="text-[8px] text-[#4a4238] uppercase tracking-[0.2em] font-bold">Colony</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {agents.map((agent, idx) => {
                const sel = idx === selectedIdx;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-2 px-2 py-[7px] text-left transition cursor-pointer border-l-2 ${
                      sel ? "bg-[#2a2318] border-[#c8a84e]" : "border-transparent hover:bg-[#1c1810]"
                    } ${!agent.enabled ? "opacity-25" : ""}`}
                  >
                    <div className="w-6 h-6 rounded-[3px] bg-[#2a2318] border border-[#3d3428]/40 overflow-hidden flex items-center justify-center flex-shrink-0">
                      <Image src={agent.profile} alt="" width={20} height={20} style={{ imageRendering: "pixelated" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-[#d4c8a8] truncate leading-tight">{agent.alias}</div>
                      <div className="text-[8px] text-[#3d3428] font-mono truncate">{agent.type}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Add agent button */}
            {agents.length < 25 && (
              <button
                onClick={addAgent}
                className="flex items-center justify-center gap-1 py-2 border-t border-[#2a2318] text-[9px] text-[#3d3428] hover:text-[#c8a84e] hover:bg-[#1c1810] transition cursor-pointer"
              >
                <UserPlus size={10} />
                <span>추가 ({agents.length}/25)</span>
              </button>
            )}
          </div>

          {/* Center: portrait */}
          <div className="w-[220px] flex-shrink-0 border-r border-[#2a2318] flex flex-col bg-[#181410]">
            <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
              <button
                onClick={() => updateAgent({ enabled: !selected.enabled })}
                className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-[3px] rounded-[3px] text-[8px] font-semibold transition cursor-pointer border ${
                  selected.enabled
                    ? "bg-[#c8a84e]/8 text-[#c8a84e] border-[#c8a84e]/15"
                    : "bg-[#2a2318] text-[#3d3428] border-[#3d3428]/30"
                }`}
              >
                {selected.enabled ? <Eye size={9} /> : <EyeOff size={9} />}
                {selected.enabled ? "참여" : "제외"}
              </button>

              {/* Portrait */}
              <div className="w-[100px] h-[100px] bg-[#12100c] border border-[#2a2318] rounded flex items-center justify-center mb-3 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#12100c]/40 rounded" />
                <Image src={selected.profile} alt="" width={64} height={64} className="relative z-10" style={{ imageRendering: "pixelated" }} />
              </div>

              {/* Nav */}
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => nav(-1)} disabled={selectedIdx === 0} className="text-[#3d3428] hover:text-[#c8a84e] disabled:opacity-15 cursor-pointer transition"><ChevronLeft size={13} /></button>
                <div className="bg-[#2a2318] border border-[#3d3428]/40 rounded-[3px] px-3 py-1 min-w-[110px] text-center">
                  <span className="text-[12px] font-bold text-[#e8dcc8]">{selected.alias}</span>
                </div>
                <button onClick={() => nav(1)} disabled={selectedIdx === agents.length - 1} className="text-[#3d3428] hover:text-[#c8a84e] disabled:opacity-15 cursor-pointer transition"><ChevronRight size={13} /></button>
              </div>

              <p className="text-[9px] text-[#5a5040] text-center leading-[1.5] max-w-[180px]">{selected.description}</p>
            </div>

            {/* Traits + Delete */}
            <div className="px-3 pb-3">
              <Hdr title="특징" icon={Shield} />
              <div className="space-y-[3px] mb-2">
                {selected.traits.map((t) => (
                  <div key={t} className="bg-[#2a2318] border border-[#3d3428]/25 rounded-[3px] px-2 py-[5px] text-center">
                    <span className="text-[10px] text-[#b8a880]">{t}</span>
                  </div>
                ))}
              </div>
              {agents.length > 2 && (
                <button
                  onClick={() => removeAgent(selectedIdx)}
                  className="w-full flex items-center justify-center gap-1 py-[5px] rounded-[3px] border border-[#C85A4A]/20 text-[9px] text-[#C85A4A]/60 hover:text-[#C85A4A] hover:bg-[#C85A4A]/5 transition cursor-pointer"
                >
                  <Trash2 size={10} />삭제
                </button>
              )}
            </div>
          </div>

          {/* Right: stats */}
          <div className="flex-1 overflow-y-auto bg-[#1c1810]">
            <div className="p-4 space-y-3">

              {/* Cash */}
              <div>
                <Hdr title="보유 현금" icon={Coins} />
                <Panel>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="range" min={0} max={1000000000} step={1000000} value={selected.cash} onChange={(e) => updateAgent({ cash: Number(e.target.value) })}
                      className="flex-1 h-[5px] cursor-pointer bg-[#2a2318] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c8a84e] [&::-webkit-slider-thumb]:cursor-pointer" />
                    <input type="text" value={Math.round(selected.cash).toLocaleString()} onChange={(e) => updateAgent({ cash: filterInt(e.target.value) })}
                      className="w-24 text-right text-[11px] font-mono font-semibold text-[#e8dcc8] bg-[#2a2318] border border-[#3d3428]/40 rounded-[3px] px-2 py-[3px] focus:outline-none focus:border-[#c8a84e]/30" />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {CASH_PRESETS.map((v) => (
                      <button key={v} onClick={() => updateAgent({ cash: v })}
                        className={`px-1.5 py-[2px] rounded-[2px] text-[8px] font-mono font-semibold transition cursor-pointer ${
                          Math.round(selected.cash) === v
                            ? "bg-[#c8a84e]/12 text-[#c8a84e] border border-[#c8a84e]/25"
                            : "bg-[#2a2318] text-[#3d3428] border border-[#2a2318] hover:text-[#5a5040]"
                        }`}>{formatKRW(v)}</button>
                    ))}
                  </div>
                </Panel>
              </div>

              {/* Personality */}
              <div>
                <Hdr title="성격" icon={Sliders} />
                <Panel className="space-y-3">
                  <Stat label="공포" value={selected.fear} onChange={(v) => updateAgent({ fear: v })} color="#C85A4A" icon={AlertTriangle} />
                  <Stat label="탐욕" value={selected.greed} onChange={(v) => updateAgent({ greed: v })} color="#5B8C3E" icon={Flame} />
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
                            className="w-full flex items-center gap-2 bg-[#2a2318] border border-[#3d3428]/25 rounded-[4px] px-2.5 py-[7px] cursor-pointer hover:bg-[#302a1e] hover:border-[#c8a84e]/20 transition text-left group"
                          >
                            <span className="text-[11px] font-bold text-[#c8a84e] w-9">{item.asset}</span>
                            <span className="text-[8px] text-[#5a5040] flex-1 truncate">{assetInfo?.name}</span>
                            <span className="text-[9px] font-mono text-[#d4c8a8]">
                              {item.amount > 0 ? item.amount : "-"}
                            </span>
                            <span className="text-[8px] font-mono text-[#3d3428]">
                              {totalVal > 0 ? formatKRW(Math.round(totalVal)) : ""}
                            </span>
                            <ChevronRight size={10} className="text-[#3d3428] group-hover:text-[#c8a84e] transition" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-2.5 text-[#3d3428] text-[9px]">보유 종목 없음</div>
                  )}
                  {selected.portfolio.length < DEFAULT_ASSETS.length && (
                    <button onClick={addPortfolioItem} className="w-full flex items-center justify-center gap-1 py-[5px] rounded-[3px] border border-dashed border-[#2a2318] text-[9px] text-[#3d3428] hover:border-[#c8a84e]/25 hover:text-[#c8a84e] transition cursor-pointer">
                      <Plus size={10} />추가
                    </button>
                  )}
                </Panel>
              </div>

              {/* Summary */}
              <Panel>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[13px] font-bold font-mono text-[#c8a84e]">{formatKRW(Math.round(selected.cash))}</div>
                    <div className="text-[7px] text-[#3d3428] mt-px uppercase tracking-wider">현금</div>
                  </div>
                  <div>
                    <div className="text-[13px] font-bold font-mono text-[#d4c8a8]">{formatKRW(totalValue)}</div>
                    <div className="text-[7px] text-[#3d3428] mt-px uppercase tracking-wider">총 자산</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[11px] font-bold font-mono text-[#C85A4A]">{selected.fear}</span>
                      <span className="text-[8px] text-[#2a2318]">/</span>
                      <span className="text-[11px] font-bold font-mono text-[#5B8C3E]">{selected.greed}</span>
                    </div>
                    <div className="text-[7px] text-[#3d3428] mt-px uppercase tracking-wider">공포 / 탐욕</div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="h-10 bg-[#13100d] border-t border-[#3d3428]/50 flex items-center px-4 gap-2 flex-shrink-0">
          <BtnSec onClick={reset} icon={RotateCcw} label="이전" />
          <div className="flex-1" />
          <BtnSec onClick={randomize} icon={Shuffle} label="랜덤" />
          <BtnSec onClick={reset} icon={RotateCcw} label="초기화" />
          <div className="flex-1" />
          <button onClick={handleStart} disabled={enabledAgents.length < 2}
            className="flex items-center gap-1.5 px-5 py-[5px] bg-[#c8a84e]/12 border border-[#c8a84e]/35 rounded-[3px] text-[11px] text-[#c8a84e] font-bold hover:bg-[#c8a84e]/22 transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
            시작<Play size={12} />
          </button>
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
            <div className="absolute inset-0 z-30 bg-black/40" onClick={() => setEditingAsset(null)} />
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto w-[320px] bg-[#1a1612] border border-[#3d3428]/60 rounded-lg shadow-[0_12px_60px_rgba(0,0,0,0.6)] animate-slide-up overflow-hidden">

                {/* Modal header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#13100d] border-b border-[#3d3428]/50">
                  <div className="flex items-center gap-2">
                    <Briefcase size={13} className="text-[#c8a84e]" />
                    <span className="text-[12px] font-bold text-[#e8dcc8]">{item.asset}</span>
                    <span className="text-[9px] text-[#5a5040]">{assetInfo?.name}</span>
                  </div>
                  <button
                    onClick={() => setEditingAsset(null)}
                    className="w-6 h-6 rounded flex items-center justify-center text-[#3d3428] hover:text-[#e8dcc8] hover:bg-[#2a2318] transition cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Modal body */}
                <div className="p-4 space-y-3">
                  {/* Current price info */}
                  <div className="bg-[#15120f] border border-[#2a2318] rounded p-3">
                    <div className="text-[8px] text-[#3d3428] uppercase tracking-wider mb-1">현재 시세</div>
                    <div className="text-[16px] font-bold font-mono text-[#e8dcc8]">{formatKRW(currentPrice)}</div>
                  </div>

                  {/* Amount input */}
                  <div>
                    <div className="text-[9px] text-[#5a5040] mb-1.5 font-semibold">보유 수량</div>
                    <input
                      type="text"
                      value={item.amount || ""}
                      onChange={(e) => updatePortfolioItem(item.asset, { amount: filterNumeric(e.target.value) })}
                      placeholder="0"
                      className="w-full text-[13px] font-mono text-[#e8dcc8] bg-[#15120f] border border-[#2a2318] rounded px-3 py-2 focus:outline-none focus:border-[#c8a84e]/40 transition"
                    />
                  </div>

                  {/* Avg price input */}
                  <div>
                    <div className="text-[9px] text-[#5a5040] mb-1.5 font-semibold">평균 매수가</div>
                    <input
                      type="text"
                      value={item.avgPrice ? item.avgPrice.toLocaleString() : ""}
                      onChange={(e) => updatePortfolioItem(item.asset, { avgPrice: filterInt(e.target.value) })}
                      placeholder="0"
                      className="w-full text-[13px] font-mono text-[#e8dcc8] bg-[#15120f] border border-[#2a2318] rounded px-3 py-2 focus:outline-none focus:border-[#c8a84e]/40 transition"
                    />
                  </div>

                  {/* Summary grid */}
                  <div className="bg-[#15120f] border border-[#2a2318] rounded p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[7px] text-[#3d3428] uppercase tracking-wider mb-0.5">매수 금액</div>
                        <div className="text-[11px] font-mono font-semibold text-[#d4c8a8]">{formatKRW(Math.round(avgCost))}</div>
                      </div>
                      <div>
                        <div className="text-[7px] text-[#3d3428] uppercase tracking-wider mb-0.5">평가 금액</div>
                        <div className="text-[11px] font-mono font-semibold text-[#e8dcc8]">{formatKRW(Math.round(totalVal))}</div>
                      </div>
                      <div>
                        <div className="text-[7px] text-[#3d3428] uppercase tracking-wider mb-0.5">평가 손익</div>
                        <div className={`text-[11px] font-mono font-semibold ${(totalVal - avgCost) >= 0 ? "text-[#5B8C3E]" : "text-[#C85A4A]"}`}>
                          {(totalVal - avgCost) >= 0 ? "+" : ""}{formatKRW(Math.round(totalVal - avgCost))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[7px] text-[#3d3428] uppercase tracking-wider mb-0.5">수익률</div>
                        <div className={`text-[11px] font-mono font-semibold flex items-center gap-0.5 ${pnl >= 0 ? "text-[#5B8C3E]" : "text-[#C85A4A]"}`}>
                          <TrendingUp size={10} />
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal footer */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#13100d] border-t border-[#3d3428]/50">
                  <button
                    onClick={() => { removePortfolioItem(item.asset); setEditingAsset(null); }}
                    className="flex items-center gap-1 px-3 py-[5px] rounded-[3px] text-[10px] text-[#C85A4A] border border-[#C85A4A]/20 bg-[#C85A4A]/5 hover:bg-[#C85A4A]/12 transition cursor-pointer font-medium"
                  >
                    <X size={10} />삭제
                  </button>
                  <button
                    onClick={() => setEditingAsset(null)}
                    className="flex items-center gap-1 px-4 py-[5px] rounded-[3px] text-[10px] text-[#c8a84e] border border-[#c8a84e]/25 bg-[#c8a84e]/8 hover:bg-[#c8a84e]/18 transition cursor-pointer font-bold"
                  >
                    확인
                  </button>
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
      <Icon size={11} className="text-[#c8a84e]" />
      <span className="text-[10px] text-[#8a7d6b] font-semibold">{title}</span>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-[#15120f] border border-[#2a2318] rounded p-3 ${className}`}>{children}</div>;
}

function BtnSec({ onClick, icon: Icon, label }: { onClick: () => void; icon: React.ComponentType<any>; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 px-3 py-[5px] bg-[#2a2318]/60 border border-[#3d3428]/40 rounded-[3px] text-[10px] text-[#5a5040] font-medium hover:text-[#b8a880] transition cursor-pointer">
      <Icon size={11} />{label}
    </button>
  );
}

function Stat({ label, value, onChange, color, icon: Icon }: {
  label: string; value: number; onChange: (v: number) => void; color: string; icon: React.ComponentType<any>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-[#5a5040] flex items-center gap-1">
          <Icon size={10} style={{ color }} />{label}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(Math.max(0, value - 5))} className="w-[14px] h-[14px] bg-[#2a2318] border border-[#3d3428]/40 rounded-[2px] flex items-center justify-center text-[#3d3428] hover:text-[#b8a880] cursor-pointer text-[8px] transition"><ChevronLeft size={8} /></button>
          <span className="text-[11px] font-mono font-bold w-6 text-center" style={{ color }}>{value}</span>
          <button onClick={() => onChange(Math.min(100, value + 5))} className="w-[14px] h-[14px] bg-[#2a2318] border border-[#3d3428]/40 rounded-[2px] flex items-center justify-center text-[#3d3428] hover:text-[#b8a880] cursor-pointer text-[8px] transition"><ChevronRight size={8} /></button>
        </div>
      </div>
      <div className="h-[4px] bg-[#2a2318] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-150" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
