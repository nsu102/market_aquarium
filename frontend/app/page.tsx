"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import AgentSidebar from "@/components/AgentSidebar";
import AssetTicker from "@/components/AssetTicker";
import AssetModal from "@/components/AssetModal";
import BoardFeed from "@/components/BoardFeed";
import RoundReport from "@/components/RoundReport";
import OverallReport from "@/components/OverallReport";
import AgentDetail from "@/components/AgentDetail";
import EventOverlay from "@/components/EventOverlay";
import SetupScreen from "@/components/SetupScreen";
import GameHUD from "@/components/GameHUD";
import ActivityLog, { type LogEntry } from "@/components/ActivityLog";
import { Agent } from "@/mock_data/agents";
import { Asset, MarketData } from "@/mock_data/market";
import { Post } from "@/mock_data/posts";
import { rounds } from "@/mock_data/rounds";
import { GameEvent } from "@/mock_data/events";
import * as control from "@/lib/control";
import { sfxTrade, sfxPost } from "@/utils/sfx";
import { Loader2 } from "lucide-react";
import type { ReverieMeta, RoundReportMeta } from "@/lib/reverieApi";
import type { GameControls } from "@/components/ReverieGame";
import type { TradeAction } from "@/constants/trade";
import { formatClock, ROUND_MINUTES, ROUND_REAL_MS } from "@/lib/timeline";

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
// One in-game day = 1200 steps.
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
  const [currentRound, setCurrentRound] = useState(0);
  const [marketOpen, setMarketOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  // Transient per-agent trade alerts for the dock (agent.id -> action), set on a
  // live trade and cleared after a short hold.
  const [tradeAlerts, setTradeAlerts] = useState<Record<string, TradeAction>>({});
  const tradeAlertTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [snsAgents, setSnsAgents] = useState<Agent[]>([]);
  const [emotionDeltas, setEmotionDeltas] = useState<
    Record<string, Record<string, number>>
  >({});
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  // True while a round is being computed on the backend (LLM, ~10-30s).
  const [computing, setComputing] = useState(false);
  const [needEvent, setNeedEvent] = useState(false); // opens after loading completes
  // Live reverie sim code, set once fork + run resolve.
  const [canonicalSim, setCanonicalSim] = useState<string | null>(null);
  // Per-user session UID from the backend (MongoDB).
  const [sessionUid, setSessionUid] = useState<string | null>(null);
  const reverieControlsRef = useRef<GameControls | null>(null);
  const [roundReport, setRoundReport] = useState<RoundReportMeta | null>(null);
  const [overall, setOverall] = useState<{
    markdown: string;
    achievements: control.OverallAchievement[];
  } | null>(null);
  const overallFetchedRef = useRef(false);
  const [gameFinished, setGameFinished] = useState(false);
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const prevPostCountRef = useRef(0);

  // --- Cosmetic day clock (UI only, does not drive data) ---
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  // True when user presses "정지" — freezes both the cosmetic timer AND the game loop.
  const [gamePaused, setGamePaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((text: string) => {
    const id = `log-${++logIdRef.current}`;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setActivityLog((prev) => [...prev.slice(-99), { id, time, text }]);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setPlaying(true);
    setClock(0);
    const startTs = performance.now();
    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - startTs;
      let t = (elapsed / ROUND_REAL_MS) * ROUND_MINUTES;
      if (t >= ROUND_MINUTES) {
        t = ROUND_MINUTES;
        setClock(t);
        stopTimer();
        setPlaying(false);
        return;
      }
      setClock(t);
    }, 60);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

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
    setSnsAgents([]);
    setEmotionDeltas({});
    setCurrentRound(0);
    setClock(0);
    setPlaying(false);
  }, []);

  const handleStart = useCallback(
    (setupAgents: Agent[], setupAssets: Asset[], presetIndices?: Record<string, number>) => {
      seedFromSetup(setupAgents, setupAssets);
      setCanonicalSim(null);
      setGameStarted(true);
      setRoundReport(null);
      setOverall(null);
      overallFetchedRef.current = false;

      const sim = `market_${Date.now()}`;
      control
        .start(FORK_SIM_CODE, sim, presetIndices)
        .then((res) => {
          setCanonicalSim(sim);
          if (res.uid) {
            setSessionUid(res.uid);
            control.saveSessionUid(res.uid);
          }
          // Use backend's full asset list (37 coins) instead of frontend DEFAULT_ASSETS (4)
          if (res.assets?.length) {
            const backendAssets = res.assets as Asset[];
            setMarketData((prev) =>
              prev ? { ...prev, assets: backendAssets } : prev
            );
          }
          // Game loaded — user clicks "이벤트" button to start a round
        })
        .catch((err) => {
          console.warn("[MarketAquarium] canonical start failed:", err);
        });
    },
    [seedFromSetup]
  );

  const handleResume = useCallback(() => {
    const savedUid = control.loadSessionUid();
    if (!savedUid) return;
    setGameStarted(true);
    setRoundReport(null);
    setOverall(null);
    overallFetchedRef.current = false;

    const sim = `resume_${Date.now()}`;
    control
      .resume(savedUid, sim)
      .then((res) => {
        if (res.status === "error") {
          console.warn("[MarketAquarium] resume failed:", res.error);
          control.clearSessionUid();
          setGameStarted(false);
          return;
        }
        setCanonicalSim(sim);
        setSessionUid(savedUid);
        if (typeof res.round === "number") setCurrentRound(res.round);
        control.marketState(savedUid).then((st) => {
          if (st.ready) {
            if (st.market) setMarketData(st.market);
            if (st.posts) setPosts(st.posts);
            if (st.events) setEvents(st.events);
            if (st.agents?.length) setAgents(st.agents);
            if (typeof st.round === "number") setCurrentRound(st.round);
          }
        }).catch(() => { });
      })
      .catch((err) => {
        console.warn("[MarketAquarium] resume failed:", err);
        control.clearSessionUid();
        setGameStarted(false);
      });
  }, []);

  /** Canonical movement-update tick: drive panels from meta.market/posts/round. */
  const handleTick = useCallback((meta: ReverieMeta) => {
    if (meta.market) setMarketData(meta.market);
    if (meta.posts) {
      // Generate log entries for new posts
      const newPosts = meta.posts.slice(prevPostCountRef.current);
      for (const p of newPosts) {
        pushLog(`${p.agentAlias}가 게시판에 글을 남겼습니다`);
      }
      prevPostCountRef.current = meta.posts.length;
      setPosts(meta.posts);
    }
    if (meta.events) setEvents(meta.events);
    if (typeof meta.round === "number") setCurrentRound(meta.round);
    if (meta.agents && meta.agents.length) {
      setAgents(meta.agents);
    }
    if (meta.round_report) setRoundReport(meta.round_report);
    // Extract board-specific data when available
    if ((meta as any).sns_agents) setSnsAgents((meta as any).sns_agents);
    if ((meta as any).emotion_deltas) setEmotionDeltas((meta as any).emotion_deltas);
    // Game finished — fetch overall report once.
    if (meta.finished && !overallFetchedRef.current) {
      overallFetchedRef.current = true;
      setGameFinished(true);
      pushLog("게임이 종료되었습니다. 종합 리포트를 확인하세요.");
      control
        .overallReport(sessionUid ?? undefined)
        .then((r) => {
          if (r.report) setOverall(r.report);
        })
        .catch((err) => console.warn("[MarketAquarium] overall report:", err));
    }
  }, [sessionUid, pushLog]);

  const handleEvent = useCallback((text: string) => {
    if (gameFinished) return;
    setNeedEvent(false);
    setComputing(true);
    pushLog(`이벤트 발생: ${text}`);
    control
      .marketEvent({ uid: sessionUid ?? undefined, text, is_rumor: false })
      .then((res) => {
        setActiveEvent({
          text,
          impact: normalizeImpact(res.impact),
          source: "user",
        });
        // Extract board data from the event response when available
        const s = (res as any).state;
        if (s) {
          if (s.sns_agents) setSnsAgents(s.sns_agents);
          if (s.emotion_deltas) setEmotionDeltas(s.emotion_deltas);
        }
        // Start the cosmetic day clock
        startTimer();
        control.run(STEPS_PER_DAY, sessionUid ?? undefined).catch((err) => {
          console.warn("[MarketAquarium] run after event:", err);
        });
      })
      .catch((err) => {
        console.warn("[MarketAquarium] marketEvent failed:", err);
        setActiveEvent({ text, impact: "neutral", source: "user" });
      })
      .finally(() => setComputing(false));
  }, [sessionUid, startTimer, gameFinished, pushLog]);

  // D4: like/dislike a post or comment.
  const handleVote = useCallback(
    (input: { post_id: string; comment_id?: string; dir: "like" | "dislike" }) => {
      control
        .boardVote({ uid: sessionUid ?? undefined, ...input })
        .then((res) => {
          if (res.posts) setPosts(res.posts);
        })
        .catch((err) => console.warn("[MarketAquarium] vote:", err));
    },
    [sessionUid]
  );

  // D3: user post/comment (a mention makes that agent reply now).
  const handlePost = useCallback(
    (input: { text: string; target_thread_id?: string; mention_agent_id?: string }) => {
      control
        .boardPost({ uid: sessionUid ?? undefined, ...input })
        .then((res) => {
          if (res.posts) { setPosts(res.posts); sfxPost(); }
          if (res.agents) setAgents(res.agents);
          if (res.sns_agents) setSnsAgents(res.sns_agents);
          if (res.emotion_deltas) setEmotionDeltas(res.emotion_deltas);
        })
        .catch((err) => console.warn("[MarketAquarium] board post:", err));
    },
    [sessionUid]
  );

  const handleToggleReport = useCallback(() => {
    setReportOpen((prev) => !prev);
  }, []);

  const handleGamePause = useCallback(() => {
    setGamePaused(true);
    stopTimer();
    setPlaying(false);
  }, [stopTimer]);

  const handleGameResume = useCallback(() => {
    setGamePaused(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    reverieControlsRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    reverieControlsRef.current?.zoomOut();
  }, []);

  const handleKeyboardEnabled = useCallback((on: boolean) => {
    reverieControlsRef.current?.setKeyboardEnabled(on);
  }, []);

  /** A round's animation finished -> tell the player with the round summary. */
  const handleRoundEnd = useCallback((_round: number) => {
    stopTimer();
    setPlaying(false);
    setReportOpen(true);
    pushLog(`라운드 ${_round} 종료`);
    if (!gameFinished) setNeedEvent(true);
  }, [stopTimer, gameFinished, pushLog]);

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
      sfxTrade();
      const actionLabel = action === "SELL" ? "매도" : "매수";
      pushLog(`${a.alias}가 ${actionLabel}를 실행했습니다`);
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
    [agents, pushLog]
  );

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} onResume={handleResume} />;
  }

  // Round report: the real backend report when available, else the mock.
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
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface-primary">
      {/* Top: map + board side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Map + overlays */}
        <main className="relative flex-1 min-w-0">
          {canonicalSim ? (
            <ReverieGame
              simCode={canonicalSim}
              uid={sessionUid ?? undefined}
              onTick={handleTick}
              controlsRef={reverieControlsRef}
              onSelectAgent={handleSelectAgent}
              onRoundEnd={handleRoundEnd}
              onAgentTrade={handleAgentTrade}
              paused={gamePaused}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-white text-pixel-muted text-sm font-bold animate-pulse-soft">
              라이브 시뮬레이션을 준비하는 중...
            </div>
          )}

          {/* Discord-style voice overlay roster (floats over the map, top-left) */}
          {marketOpen && (
            <div className="absolute top-14 left-2 z-30 w-[260px] max-h-[calc(100%-5rem)] overflow-y-auto pr-1">
              <AgentSidebar agents={agents} alerts={tradeAlerts} onSelect={setSelectedAgent} />
            </div>
          )}

          <GameHUD
            round={currentRound}
            clock={formatClock(clock)}
            playing={!gamePaused}
            onEvent={handleEvent}
            onToggleReport={handleToggleReport}
            reportOpen={reportOpen}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onKeyboardEnabled={handleKeyboardEnabled}
            onResume={handleGameResume}
            onStop={handleGamePause}
            forceEventOpen={needEvent && !gameFinished}
            onOpenEvent={() => !gameFinished && setNeedEvent(true)}
            gameFinished={gameFinished}
          />

          <ActivityLog entries={activityLog} />
        </main>

        {/* Right column: board feed */}
        {boardOpen && (
          <aside className="w-[370px] shrink-0 border-l-2 border-black overflow-hidden">
            <BoardFeed
              posts={posts}
              events={events}
              agents={agents}
              snsAgents={snsAgents}
              emotionDeltas={emotionDeltas}
              currentRound={currentRound}
              onPost={handlePost}
              onVote={handleVote}
            />
          </aside>
        )}
      </div>

      {/* Bottom dock: full-width market price ticker */}
      <AssetTicker assets={marketData?.assets ?? []} onSelect={setSelectedAsset} />

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
          </div>
        </div>
      )}

      {/* End-of-game (5 rounds) overall report + achievements */}
      {overall && (
        <OverallReport
          report={overall}
          agents={agents}
          activityLog={activityLog}
          onClose={() => setOverall(null)}
        />
      )}

      {selectedAgent && (
        <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}

      {selectedAsset && (
        <AssetModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
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
