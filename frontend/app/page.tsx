"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import MarketPanel from "@/components/MarketPanel";
import BoardFeed from "@/components/BoardFeed";
import RoundReport from "@/components/RoundReport";
import AgentDetail from "@/components/AgentDetail";
import EventOverlay from "@/components/EventOverlay";
import SetupScreen from "@/components/SetupScreen";
import GameHUD from "@/components/GameHUD";
import { Agent } from "@/mock_data/agents";
import { Asset, MarketData } from "@/mock_data/market";
import { Post } from "@/mock_data/posts";
import { rounds } from "@/mock_data/rounds";
import { GameEvent } from "@/mock_data/events";
import * as control from "@/lib/control";
import type { ReverieMeta } from "@/lib/reverieApi";
import type { GameControls } from "@/components/ReverieGame";

// Canonical Phaser viewer is client-only (loads Phaser + the_ville assets).
const ReverieGame = dynamic(() => import("@/components/ReverieGame"), {
  ssr: false,
});

interface ActiveEvent {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
}

// Canonical mode fork + how many steps to queue up front.
const FORK_SIM_CODE = "base_the_ville_market6";
// Run the live sim continuously so the map renders agents living their day
// (reverie is a continuous-time model). The user's event is the market shock
// injected on top; agents react to it via emotion/posts/trades. 6000 ticks ~5 days.
const CANONICAL_RUN_STEPS = 6000;

/** Normalize the control server's event impact into the overlay's enum. */
function normalizeImpact(
  impact: control.MarketImpact
): "positive" | "negative" | "neutral" {
  if (typeof impact === "number") {
    if (impact > 0) return "positive";
    if (impact < 0) return "negative";
    return "neutral";
  }
  if (impact === "positive" || impact === "negative" || impact === "neutral") {
    return impact;
  }
  return "neutral";
}

export default function Home() {
  const [gameStarted, setGameStarted] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [marketOpen, setMarketOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  // Live reverie sim code, set once fork + run resolve.
  const [canonicalSim, setCanonicalSim] = useState<string | null>(null);
  const reverieControlsRef = useRef<GameControls | null>(null);

  /** Optimistic seed so the panels aren't empty before live data arrives. */
  const seedFromSetup = useCallback((setupAgents: Agent[], setupAssets: Asset[]) => {
    setAgents(setupAgents);
    setMarketData({
      assets: setupAssets,
      fearGreedIndex: 50,
      rumorSpeed: 0,
      panicSellRatio: 0,
      fomoBuyRatio: 0,
      whaleBuyIntensity: 0,
      whaleSellIntensity: 0,
      sentimentContribution: setupAgents.map((a) => ({ agent: a.alias, value: 0 })),
    });
    setEvents([]);
    setPosts([]);
    setCurrentRound(1);
  }, []);

  const handleStart = useCallback(
    (setupAgents: Agent[], setupAssets: Asset[]) => {
      seedFromSetup(setupAgents, setupAssets);
      setCanonicalSim(null);
      setGameStarted(true);

      // Canonical/live path: fork + run the reverie sim so the map renders
      // immediately (agents live their day). The server auto-drops any prior
      // sim, so restarting from setup just works.
      const sim = `market_${Date.now()}`;
      control
        .start(FORK_SIM_CODE, sim)
        .then(() => control.run(CANONICAL_RUN_STEPS))
        .then(() => {
          setCanonicalSim(sim);
        })
        .catch((err) => {
          console.warn("[MarketAquarium] canonical start failed:", err);
        });
    },
    [seedFromSetup]
  );

  /** Canonical movement-update tick: drive panels from meta.market/posts/round. */
  const handleTick = useCallback((meta: ReverieMeta) => {
    if (meta.market) setMarketData(meta.market);
    if (meta.posts) setPosts(meta.posts);
    if (meta.events) setEvents(meta.events);
    if (typeof meta.round === "number") setCurrentRound(meta.round);
  }, []);

  const handleEvent = useCallback((text: string) => {
    // Inject the round's global event via the control server. Market/posts
    // updates then flow back through handleTick on the next movement update.
    // The sim is already running; agents pick the shock up on their next board
    // visit (view_sns) and trade, and the day's price distortion reflects it
    // at the day boundary.
    control
      .marketEvent({ text, is_rumor: false })
      .then((res) => {
        setActiveEvent({
          text,
          impact: normalizeImpact(res.impact),
          source: "user",
        });
      })
      .catch((err) => {
        console.warn("[MarketAquarium] marketEvent failed:", err);
        setActiveEvent({ text, impact: "neutral", source: "user" });
      });
  }, []);

  const handleToggleReport = useCallback(() => {
    setReportOpen((prev) => !prev);
  }, []);

  const handleZoomIn = useCallback(() => {
    reverieControlsRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    reverieControlsRef.current?.zoomOut();
  }, []);

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
  }

  // Round report content: the matching mock round markdown (live overall report
  // is not exposed by the control server in MVP).
  const mockReport =
    rounds.find((r) => r.round === currentRound) || rounds[rounds.length - 1];
  const reportForView = {
    round: currentRound,
    markdown: mockReport.markdown,
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-primary">
      {/* Full-screen game map (canonical reverie viewer) */}
      <div className="absolute inset-0">
        {canonicalSim ? (
          <ReverieGame
            simCode={canonicalSim}
            onTick={handleTick}
            controlsRef={reverieControlsRef}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-tertiary text-sm">
            라이브 시뮬레이션을 준비하는 중...
          </div>
        )}
      </div>

      {/* HUD overlay */}
      <GameHUD
        round={currentRound}
        onEvent={handleEvent}
        marketOpen={marketOpen}
        boardOpen={boardOpen}
        onToggleMarket={() => setMarketOpen(!marketOpen)}
        onToggleBoard={() => setBoardOpen(!boardOpen)}
        onToggleReport={handleToggleReport}
        reportOpen={reportOpen}
        marketNotifications={events.length}
        boardNotifications={posts.length}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      {/* Market panel - floating left, content-fit */}
      {marketOpen && marketData && (
        <div className="absolute left-4 top-16 w-[300px] z-20 max-h-[calc(100vh-7rem)]">
          <div className="bg-surface-card border border-border-light rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
            <MarketPanel data={marketData} />
          </div>
        </div>
      )}

      {/* Board feed - floating right */}
      {boardOpen && (
        <div className="absolute right-4 top-16 bottom-16 w-[370px] z-20">
          <div className="h-full rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
            <BoardFeed posts={posts} events={events} />
          </div>
        </div>
      )}

      {/* Round report - center modal */}
      {reportOpen && (
        <RoundReport report={reportForView} onClose={() => setReportOpen(false)} />
      )}

      {selectedAgent && (
        <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}

      {activeEvent && (
        <EventOverlay
          text={activeEvent.text}
          impact={activeEvent.impact}
          source={activeEvent.source}
          onDone={() => setActiveEvent(null)}
        />
      )}
    </div>
  );
}
