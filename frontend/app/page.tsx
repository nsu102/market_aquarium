"use client";

import { useState, useCallback, useRef } from "react";
import MarketPanel from "@/components/MarketPanel";
import AquariumMap, { AquariumMapHandle } from "@/components/AquariumMap";
import BoardFeed from "@/components/BoardFeed";
import RoundReport from "@/components/RoundReport";
import AgentDetail from "@/components/AgentDetail";
import EventOverlay from "@/components/EventOverlay";
import SetupScreen from "@/components/SetupScreen";
import GameHUD from "@/components/GameHUD";
import { Agent } from "@/mock_data/agents";
import { Asset, MarketData } from "@/mock_data/market";
import { Post } from "@/mock_data/posts";
import { posts as mockPosts } from "@/mock_data/posts";
import { rounds as mockRounds, RoundReport as RoundReportType } from "@/mock_data/rounds";
import { GameEvent } from "@/mock_data/events";
import { createGame, nextRound } from "@/lib/api";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "true";

interface ActiveEvent {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
}

export default function Home() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  // keep setup data for session recovery
  const setupRef = useRef<{ agents: any[]; assets: any[] } | null>(null);
  const [marketOpen, setMarketOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<RoundReportType[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const mapRef = useRef<AquariumMapHandle>(null);

  // ── Mock: local-only start ──
  const handleStartMock = useCallback((setupAgents: Agent[], setupAssets: Asset[]) => {
    setAgents(setupAgents);
    setMarketData({
      assets: setupAssets,
      fearGreedIndex: 50, rumorSpeed: 0, panicSellRatio: 0,
      fomoBuyRatio: 0, whaleBuyIntensity: 0, whaleSellIntensity: 0,
      sentimentContribution: setupAgents.map((a) => ({ agent: a.alias, value: 0 })),
    });
    setEvents([]);
    setPosts(mockPosts);
    setReports(mockRounds);
    setCurrentRound(1);
    setGameStarted(true);
  }, []);

  const handleEventMock = useCallback((text: string) => {
    const impact: ActiveEvent["impact"] = Math.random() > 0.5 ? "negative" : "positive";
    const ts = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const ev: GameEvent = { id: `e${Date.now()}`, round: currentRound, text, source: "user", impact, timestamp: ts };
    setEvents((prev) => [ev, ...prev]);
    setPosts((prev) => [{
      id: `p${Date.now()}`, agentId: "system", agentAlias: "시스템",
      content: `[속보] ${text}`, likes: 0, comments: [], timestamp: ts, round: currentRound,
    }, ...prev]);
    setActiveEvent({ text, impact, source: "user" });
  }, [currentRound]);

  // ── API: backend-connected start ──
  const createAndSetGame = useCallback(async (setupAgents: Agent[], setupAssets: Asset[]) => {
    const apiAgents = setupAgents.map((a) => ({ id: a.id, alias: a.alias, type: a.type, sprite: a.sprite, cash: a.cash, portfolio: a.portfolio, fear: a.fear, greed: a.greed, color: a.color }));
    const apiAssets = setupAssets.map((a) => ({ symbol: a.symbol, name: a.name, price: a.price }));
    setupRef.current = { agents: apiAgents, assets: apiAssets };

    const res = await createGame(apiAgents, apiAssets);
    setGameId(res.gameId);
    setAgents(res.agents.map((a: any, i: number) => ({
      ...a, position: setupAgents[i]?.position || { x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 },
    })));
    setMarketData(res.market);
    setEvents([]);
    setPosts([]);
    setReports([]);
    setCurrentRound(res.round);
    return res.gameId as string;
  }, []);

  const handleStartAPI = useCallback(async (setupAgents: Agent[], setupAssets: Asset[]) => {
    try {
      await createAndSetGame(setupAgents, setupAssets);
      setGameStarted(true);
    } catch (err) {
      console.error("Backend unavailable, falling back to mock:", err);
      handleStartMock(setupAgents, setupAssets);
    }
  }, [handleStartMock, createAndSetGame]);

  const applyRoundResult = useCallback((res: any) => {
    setAgents((prev) => res.agents.map((a: any) => {
      const existing = prev.find((p) => p.id === a.id);
      return { ...a, position: existing?.position || { x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 } };
    }));
    setMarketData(res.market);
    if (res.events) setEvents((prev) => [...res.events.map((e: any) => e as GameEvent), ...prev]);
    if (res.events?.[0]) setActiveEvent({ text: res.events[0].text, impact: res.events[0].impact, source: res.events[0].source });
    if (res.newPosts) setPosts((prev) => [...res.newPosts, ...prev]);
    if (res.report) setReports((prev) => [...prev, res.report]);
    setCurrentRound(res.round + 1);
  }, []);

  const handleEventAPI = useCallback(async (text: string) => {
    if (!gameId || isProcessing) return;
    setIsProcessing(true);
    setActiveEvent({ text, impact: "neutral", source: "user" });

    try {
      const res = await nextRound(gameId, text);
      applyRoundResult(res);
    } catch (err: any) {
      // Session lost (server restart) — re-create game and retry
      if (err.message === "GAME_NOT_FOUND" && setupRef.current) {
        console.warn("Game session lost, re-creating...");
        try {
          const newId = await createAndSetGame(agents as Agent[], marketData?.assets as Asset[] || []);
          const res = await nextRound(newId, text);
          applyRoundResult(res);
        } catch (retryErr) {
          console.error("Recovery failed:", retryErr);
        }
      } else {
        console.error("Round failed:", err);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [gameId, isProcessing, agents, marketData, applyRoundResult, createAndSetGame]);

  // ── Route handlers by mode ──
  const handleStart = IS_MOCK ? handleStartMock : handleStartAPI;
  const handleEvent = IS_MOCK ? handleEventMock : handleEventAPI;

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
  }

  const currentReport = reports.find((r) => r.round === currentRound - 1) || reports[reports.length - 1];

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <AquariumMap ref={mapRef} agents={agents} onSelectAgent={setSelectedAgent} />
      </div>

      <GameHUD
        round={currentRound}
        onEvent={handleEvent}
        marketOpen={marketOpen}
        boardOpen={boardOpen}
        onToggleMarket={() => setMarketOpen(!marketOpen)}
        onToggleBoard={() => setBoardOpen(!boardOpen)}
        onToggleReport={() => setReportOpen(!reportOpen)}
        reportOpen={reportOpen}
        marketNotifications={events.length}
        boardNotifications={posts.length}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        isProcessing={isProcessing}
      />

      {marketOpen && marketData && (
        <div className="absolute left-4 top-16 w-[300px] z-20 max-h-[calc(100vh-7rem)]">
          <div className="bg-surface-card border border-border-light rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
            <MarketPanel data={marketData} />
          </div>
        </div>
      )}

      {boardOpen && (
        <div className="absolute right-4 top-16 bottom-16 w-[370px] z-20">
          <div className="h-full rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
            <BoardFeed posts={posts} />
          </div>
        </div>
      )}

      {reportOpen && currentReport && (
        <RoundReport report={currentReport} onClose={() => setReportOpen(false)} />
      )}

      {selectedAgent && (
        <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}

      {activeEvent && (
        <EventOverlay text={activeEvent.text} impact={activeEvent.impact} source={activeEvent.source} onDone={() => setActiveEvent(null)} />
      )}
    </div>
  );
}
