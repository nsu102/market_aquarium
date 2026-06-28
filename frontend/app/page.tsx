"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import AgentSidebar from "@/components/AgentSidebar";
import AssetTicker from "@/components/AssetTicker";
import BoardFeed from "@/components/BoardFeed";
import RoundReport from "@/components/RoundReport";
import OverallReport from "@/components/OverallReport";
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
import { Loader2 } from "lucide-react";
import type { ReverieMeta } from "@/lib/reverieApi";
import type { GameControls } from "@/components/ReverieGame";
import type { TradeAction } from "@/constants/trade";

// Canonical Phaser viewer is client-only (loads Phaser + the_ville assets).
const ReverieGame = dynamic(() => import("@/components/ReverieGame"), {
  ssr: false,
});

interface ActiveEvent {
  text: string;
  impact: "positive" | "negative" | "neutral";
  source: "user" | "system";
}

// Canonical mode fork.
const FORK_SIM_CODE = "base_the_ville_market6";
// One in-game day = 1200 steps. We do NOT run at game start (agents stand idle);
// each user event injects the shock then runs exactly one day so agents plan the
// day AFTER the event is set and react to it the same day.
const STEPS_PER_DAY = 1200;

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
  // Transient per-agent trade alerts for the dock (agent.id -> action), set on a
  // live trade and cleared after a short hold.
  const [tradeAlerts, setTradeAlerts] = useState<Record<string, TradeAction>>({});
  const tradeAlertTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  // True while a round is being computed on the backend (LLM, ~10-30s).
  const [computing, setComputing] = useState(false);
  // Live reverie sim code, set once fork + run resolve.
  const [canonicalSim, setCanonicalSim] = useState<string | null>(null);
  const reverieControlsRef = useRef<GameControls | null>(null);
  // Real round report (from meta) + end-of-game overall report.
  const [roundReport, setRoundReport] =
    useState<NonNullable<ReverieMeta["round_report"]> | null>(null);
  const [overall, setOverall] = useState<{
    markdown: string;
    achievements: control.OverallAchievement[];
  } | null>(null);
  const overallFetchedRef = useRef(false);

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
      // Reset report state for the new game.
      setRoundReport(null);
      setOverall(null);
      overallFetchedRef.current = false;

      // Canonical/live path: ONLY fork the reverie sim so the map renders
      // immediately with agents standing idle at their spawn tiles. We do NOT
      // run here — the day is planned/run only after the user injects an event,
      // so agents react that same day. The server auto-drops any prior sim, so
      // restarting from setup just works.
      const sim = `market_${Date.now()}`;
      control
        .start(FORK_SIM_CODE, sim)
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
    // Live agents (pre-computed portfolio + live cash/fear/greed/lastAction).
    if (meta.agents && meta.agents.length) setAgents(meta.agents);
    // Real round report (with price-breakdown infographic) replaces the mock.
    if (meta.round_report) setRoundReport(meta.round_report);
    // FR-9: at the end of 5 rounds, fetch + show the overall report once.
    if (meta.finished && !overallFetchedRef.current) {
      overallFetchedRef.current = true;
      control
        .overallReport()
        .then((r) => {
          if (r.report) setOverall(r.report);
        })
        .catch((err) => console.warn("[MarketAquarium] overall report:", err));
    }
  }, []);

  const handleEvent = useCallback((text: string) => {
    // Inject the round's global event, THEN run exactly one in-game day. The day
    // is planned at the first run step AFTER the event is set, so agents react
    // that same day (the backend only injects board/exchange visits while an
    // event is active). Market/posts updates flow back through handleTick as the
    // movement JSON streams in.
    setComputing(true);
    control
      .marketEvent({ text, is_rumor: false })
      .then((res) => {
        setActiveEvent({
          text,
          impact: normalizeImpact(res.impact),
          source: "user",
        });
        // Kick off one day. Ignore "already running" errors — a run may still
        // be draining from a previous event.
        control.run(STEPS_PER_DAY).catch((err) => {
          console.warn("[MarketAquarium] run after event:", err);
        });
      })
      .catch((err) => {
        console.warn("[MarketAquarium] marketEvent failed:", err);
        setActiveEvent({ text, impact: "neutral", source: "user" });
      })
      .finally(() => setComputing(false));
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

  /** A round's animation finished -> tell the player with the round summary. */
  const handleRoundEnd = useCallback((_round: number) => {
    setReportOpen(true);
  }, []);

  /** Click a character on the map -> open its detail (portfolio composition). */
  const handleSelectAgent = useCallback(
    (original: string) => {
      const underscore = original.replace(/ /g, "_");
      const a = agents.find(
        (x) => x.sprite?.includes(underscore) || x.alias === original
      );
      if (a) setSelectedAgent(a);
    },
    [agents]
  );

  /** A persona traded at the exchange this step -> flash a dock alert. */
  const handleAgentTrade = useCallback(
    (original: string, action: TradeAction) => {
      const underscore = original.replace(/ /g, "_");
      const a = agents.find(
        (x) => x.sprite?.includes(underscore) || x.alias === original
      );
      if (!a) return;
      const id = a.id;
      setTradeAlerts((prev) => ({ ...prev, [id]: action }));
      clearTimeout(tradeAlertTimers.current[id]);
      tradeAlertTimers.current[id] = setTimeout(() => {
        setTradeAlerts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 2600);
    },
    [agents]
  );

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
  }

  // Round report: the real backend report (with price-breakdown infographic)
  // when available, else the mock fallback.
  const mockReport =
    rounds.find((r) => r.round === currentRound) || rounds[rounds.length - 1];
  const reportForView = roundReport
    ? {
        round: roundReport.round,
        markdown: roundReport.markdown,
        price_breakdowns: roundReport.price_breakdowns,
      }
    : { round: currentRound, markdown: mockReport.markdown };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-surface-primary">
      {/* Left sidebar + center map + bottom dock */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Main view: full-width map with overlays anchored on top */}
        <div className="flex-1 flex min-h-0">
          <main className="relative flex-1 min-w-0">
            {canonicalSim ? (
              <ReverieGame
                simCode={canonicalSim}
                onTick={handleTick}
                controlsRef={reverieControlsRef}
                onSelectAgent={handleSelectAgent}
                onRoundEnd={handleRoundEnd}
                onAgentTrade={handleAgentTrade}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-white text-pixel-muted text-sm font-bold animate-pulse-soft">
                라이브 시뮬레이션을 준비하는 중...
              </div>
            )}

            {/* Discord-style voice overlay roster (floats over the map, top-left) */}
            {marketOpen && (
              <div className="absolute top-14 left-2 z-30 w-[210px] max-h-[calc(100%-5rem)] overflow-y-auto pr-1">
                <AgentSidebar agents={agents} alerts={tradeAlerts} onSelect={setSelectedAgent} />
              </div>
            )}

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
          </main>
        </div>

        {/* Bottom dock: market price ticker (name / price / change% + sparkline),
            capped at 8 assets. */}
        <AssetTicker assets={marketData?.assets ?? []} />
      </div>

      {/* Right column: board feed, full height */}
      {boardOpen && (
        <aside className="w-[370px] shrink-0 border-l-2 border-black overflow-hidden">
          <BoardFeed posts={posts} events={events} />
        </aside>
      )}

      {/* Round report - center modal */}
      {reportOpen && (
        <RoundReport report={reportForView} onClose={() => setReportOpen(false)} />
      )}

      {/* Computing a round (LLM) — show progress so the wait is not a dead screen */}
      {computing && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-pixel-ink/60">
          <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg px-6 py-5 flex flex-col items-center gap-3 max-w-[320px]">
            <Loader2 size={28} className="text-pixel-greenText animate-spin" />
            <div className="text-sm font-bold text-black">에이전트들이 반응하는 중...</div>
            <div className="text-[11px] text-pixel-muted text-center leading-relaxed">
              이벤트를 인식하고 게시판·매매를 결정하고 있어요. 잠시만요.
            </div>
          </div>
        </div>
      )}

      {/* End-of-game (5 rounds) overall report + achievements */}
      {overall && (
        <OverallReport report={overall} onClose={() => setOverall(null)} />
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
