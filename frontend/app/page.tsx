"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import MarketPanel from "@/components/MarketPanel";
import AquariumMap, { AquariumMapHandle } from "@/components/AquariumMap";
import BoardFeed from "@/components/BoardFeed";
import RoundReport from "@/components/RoundReport";
import AgentDetail from "@/components/AgentDetail";
import EventOverlay from "@/components/EventOverlay";
import SetupScreen, { GameMode } from "@/components/SetupScreen";
import GameHUD from "@/components/GameHUD";
import { Agent } from "@/mock_data/agents";
import { Asset, MarketData } from "@/mock_data/market";
import { Post, posts as initialPosts } from "@/mock_data/posts";
import { rounds } from "@/mock_data/rounds";
import { GameEvent } from "@/mock_data/events";
import {
  startGame,
  submitEvent,
  getReport,
  GameState,
  RoundReportData,
} from "@/lib/api";
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

// "mock"/"backend" -> standalone market API (:8100); "canonical" -> live reverie.
type Connection = "mock" | "backend" | "canonical";

// Canonical mode fork + how many steps to queue up front.
const FORK_SIM_CODE = "base_the_ville_market6";
const CANONICAL_RUN_STEPS = 3000;

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
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  // Backend wiring state
  const [connection, setConnection] = useState<Connection>("mock");
  const [canonicalSim, setCanonicalSim] = useState<string | null>(null);
  const [roundReport, setRoundReport] = useState<RoundReportData | null>(null);
  const [overallMarkdown, setOverallMarkdown] = useState<string | null>(null);
  const mapRef = useRef<AquariumMapHandle>(null);
  const reverieControlsRef = useRef<GameControls | null>(null);

  /** Apply a backend GameState snapshot to local UI state. */
  const applyGameState = useCallback((state: GameState) => {
    setAgents(state.agents);
    setMarketData(state.market);
    setPosts(state.posts);
    setEvents(state.events);
    setCurrentRound(state.round);
  }, []);

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

  /** Standalone path: optimistic mock, then try the market API (:8100). */
  const startStandalone = useCallback(
    (setupAgents: Agent[]) => {
      setConnection("mock");
      startGame(setupAgents.length, 42)
        .then((state) => {
          applyGameState(state);
          setConnection("backend");
        })
        .catch((err) => {
          console.warn("[MarketAquarium] startGame failed, using mock:", err);
          setConnection("mock");
        });
    },
    [applyGameState]
  );

  /** Canonical path: fork + run the live reverie sim; fall back if unreachable. */
  const startCanonical = useCallback(
    (setupAgents: Agent[]) => {
      const sim = `market_${Date.now()}`;
      setConnection("canonical");
      control
        .start(FORK_SIM_CODE, sim)
        .then(() => control.run(CANONICAL_RUN_STEPS))
        .then(() => {
          setCanonicalSim(sim);
        })
        .catch((err) => {
          console.warn(
            "[MarketAquarium] canonical start failed, falling back to standalone:",
            err
          );
          setCanonicalSim(null);
          startStandalone(setupAgents);
        });
    },
    [startStandalone]
  );

  const handleStart = useCallback(
    (setupAgents: Agent[], setupAssets: Asset[], mode: GameMode) => {
      seedFromSetup(setupAgents, setupAssets);
      setRoundReport(null);
      setOverallMarkdown(null);
      setCanonicalSim(null);
      setGameStarted(true);

      if (mode === "canonical") {
        startCanonical(setupAgents);
      } else {
        startStandalone(setupAgents);
      }
    },
    [seedFromSetup, startCanonical, startStandalone]
  );

  /** Canonical movement-update tick: drive panels from meta.market/posts/round. */
  const handleTick = useCallback((meta: ReverieMeta) => {
    if (meta.market) setMarketData(meta.market);
    if (meta.posts) setPosts(meta.posts);
    if (typeof meta.round === "number") setCurrentRound(meta.round);
  }, []);

  const handleEvent = useCallback(
    (text: string) => {
      // Local mock behavior, used directly when offline and as an instant
      // fallback if the backend call fails.
      const mockEvent = () => {
        const impact: "positive" | "negative" | "neutral" =
          Math.random() > 0.5 ? "negative" : "positive";
        const timestamp = new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const newEvent: GameEvent = {
          id: `e${Date.now()}`,
          round: currentRound,
          text,
          source: "user",
          impact,
          timestamp,
        };
        setEvents((prev) => [newEvent, ...prev]);
        setPosts((prev) => [
          {
            id: `p${Date.now()}`,
            agentId: "system",
            agentAlias: "시스템",
            content: `[속보] ${text}`,
            likes: 0,
            comments: [],
            timestamp,
            round: currentRound,
          },
          ...prev,
        ]);
        setActiveEvent({ text, impact, source: "user" });
      };

      // Canonical: inject the round event via the control server. Market/posts
      // updates then flow back through handleTick on the next movement update.
      if (connection === "canonical") {
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
            console.warn("[MarketAquarium] marketEvent failed, using mock:", err);
            mockEvent();
          });
        return;
      }

      if (connection !== "backend") {
        mockEvent();
        return;
      }

      submitEvent({ text, is_rumor: false })
        .then((res) => {
          applyGameState(res);
          setRoundReport(res.round_report);
          // Drive the event overlay from the freshly returned event's impact.
          const justFired =
            res.events.find((e) => e.text === text) ?? res.events[0];
          setActiveEvent({
            text,
            impact: justFired?.impact ?? "neutral",
            source: "user",
          });
        })
        .catch((err) => {
          console.warn("[MarketAquarium] submitEvent failed, using mock:", err);
          mockEvent();
        });
    },
    [connection, currentRound, applyGameState]
  );

  const handleToggleReport = useCallback(() => {
    const next = !reportOpen;
    setReportOpen(next);
    if (next && connection === "backend") {
      // Prefer the backend overall report when opening.
      getReport()
        .then((report) => setOverallMarkdown(report.markdown))
        .catch((err) => {
          console.warn("[MarketAquarium] getReport failed, using fallback:", err);
          setOverallMarkdown(null);
        });
    }
  }, [reportOpen, connection]);

  const handleZoomIn = useCallback(() => {
    if (connection === "canonical") reverieControlsRef.current?.zoomIn();
    else mapRef.current?.zoomIn();
  }, [connection]);

  const handleZoomOut = useCallback(() => {
    if (connection === "canonical") reverieControlsRef.current?.zoomOut();
    else mapRef.current?.zoomOut();
  }, [connection]);

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
  }

  // Choose report content: backend overall report > latest round report > mock.
  const mockReport =
    rounds.find((r) => r.round === currentRound) || rounds[rounds.length - 1];
  const reportForView = {
    round: roundReport?.round ?? currentRound,
    markdown: overallMarkdown ?? roundReport?.markdown ?? mockReport.markdown,
  };

  const isCanonical = connection === "canonical" && canonicalSim;

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-primary">
      {/* Full-screen game map */}
      <div className="absolute inset-0">
        {isCanonical ? (
          <ReverieGame
            simCode={canonicalSim}
            onTick={handleTick}
            controlsRef={reverieControlsRef}
          />
        ) : (
          <AquariumMap ref={mapRef} agents={agents} onSelectAgent={setSelectedAgent} />
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
            <BoardFeed posts={posts} />
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
