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

interface ActiveEvent {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
}

type Connection = "mock" | "backend";

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
  const [roundReport, setRoundReport] = useState<RoundReportData | null>(null);
  const [overallMarkdown, setOverallMarkdown] = useState<string | null>(null);
  const mapRef = useRef<AquariumMapHandle>(null);

  /** Apply a backend GameState snapshot to local UI state. */
  const applyGameState = useCallback((state: GameState) => {
    setAgents(state.agents);
    setMarketData(state.market);
    setPosts(state.posts);
    setEvents(state.events);
    setCurrentRound(state.round);
  }, []);

  const handleStart = useCallback(
    (setupAgents: Agent[], setupAssets: Asset[]) => {
      // Optimistically show the game using mock init so the UI is responsive,
      // then try to replace it with real backend state.
      const mockInit = () => {
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
        setConnection("mock");
      };

      mockInit();
      setRoundReport(null);
      setOverallMarkdown(null);
      setGameStarted(true);

      startGame(setupAgents.length, 42)
        .then((state) => {
          applyGameState(state);
          setConnection("backend");
        })
        .catch((err) => {
          // Backend offline: keep mock initialization so the demo still works.
          console.warn("[MarketAquarium] startGame failed, using mock:", err);
          setConnection("mock");
        });
    },
    [applyGameState]
  );

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

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-primary">
      {/* Full-screen game map */}
      <div className="absolute inset-0">
        <AquariumMap ref={mapRef} agents={agents} onSelectAgent={setSelectedAgent} />
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
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
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
