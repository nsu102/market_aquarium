"use client";

import { useState, useCallback } from "react";
import MarketPanel from "@/components/MarketPanel";
import AquariumMap from "@/components/AquariumMap";
import BoardFeed from "@/components/BoardFeed";
import RoundReport from "@/components/RoundReport";
import AgentDetail from "@/components/AgentDetail";
import EventOverlay from "@/components/EventOverlay";
import SetupScreen from "@/components/SetupScreen";
import GameHUD from "@/components/GameHUD";
import { Agent } from "@/mock_data/agents";
import { Asset, MarketData } from "@/mock_data/market";
import { posts as initialPosts } from "@/mock_data/posts";
import { rounds } from "@/mock_data/rounds";
import { events as initialEvents, GameEvent } from "@/mock_data/events";

interface ActiveEvent {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
}

export default function Home() {
  const [gameStarted, setGameStarted] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [marketOpen, setMarketOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [posts, setPosts] = useState(initialPosts);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);

  const handleStart = useCallback((setupAgents: Agent[], setupAssets: Asset[]) => {
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
    setGameStarted(true);
  }, []);

  const handleEvent = useCallback((text: string) => {
    const impact: "positive" | "negative" | "neutral" =
      Math.random() > 0.5 ? "negative" : "positive";
    const newEvent: GameEvent = {
      id: `e${Date.now()}`,
      round: currentRound,
      text,
      source: "user",
      impact,
      timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
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
        timestamp: newEvent.timestamp,
        round: currentRound,
      },
      ...prev,
    ]);
    setActiveEvent({ text, impact, source: "user" });
  }, [currentRound]);

  const nextRound = useCallback(() => {
    setCurrentRound((r) => r + 1);
  }, []);

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
  }

  const currentReport = rounds.find((r) => r.round === currentRound) || rounds[rounds.length - 1];

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-primary">
      {/* Full-screen game map */}
      <div className="absolute inset-0">
        <AquariumMap agents={agents} onSelectAgent={setSelectedAgent} />
      </div>

      {/* HUD overlay */}
      <GameHUD
        round={currentRound}
        playing={playing}
        onTogglePlay={() => setPlaying(!playing)}
        onNextRound={nextRound}
        onEvent={handleEvent}
        marketOpen={marketOpen}
        boardOpen={boardOpen}
        onToggleMarket={() => setMarketOpen(!marketOpen)}
        onToggleBoard={() => setBoardOpen(!boardOpen)}
        marketNotifications={events.length}
        boardNotifications={posts.length}
      />

      {/* Market panel - floating left */}
      {marketOpen && marketData && (
        <div className="absolute left-4 top-16 bottom-14 w-[300px] z-20">
          <div className="h-full bg-surface-card/95 backdrop-blur-md border border-border-light rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col">
            <MarketPanel data={marketData} />
          </div>
        </div>
      )}

      {/* Board feed - floating right */}
      {boardOpen && (
        <div className="absolute right-4 top-16 bottom-14 w-[370px] z-20">
          <div className="h-full rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
            <BoardFeed posts={posts} />
          </div>
        </div>
      )}

      {/* Round report - floating bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <RoundReport report={currentReport} events={events.filter((e) => e.round === currentRound)} />
      </div>

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
