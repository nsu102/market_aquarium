"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import MarketPanel from "@/components/MarketPanel";
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
import { Loader2, Zap, Send, X, CheckCircle2 } from "lucide-react";
import type { ReverieMeta, RoundReportMeta } from "@/lib/reverieApi";
import type { GameControls } from "@/components/ReverieGame";
import {
  RoundData,
  visiblePosts,
  interpMarket,
  formatClock,
  ROUND_MINUTES,
  ROUND_REAL_MS,
} from "@/lib/timeline";

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
  const [snsAgents, setSnsAgents] = useState<Agent[]>([]);
  const [emotionDeltas, setEmotionDeltas] = useState<
    Record<string, Record<string, number>>
  >({});
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  // True while the round (LLM scenario) is being generated on the backend.
  const [computing, setComputing] = useState(false);
  // Round-1 event-input modal (auto-opens at game start). Rounds 2+ use the
  // board-top "다음 이벤트" card instead.
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const autoEventShown = useRef(false);
  // Live reverie sim code, set once fork resolves.
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

  // --- Timer replay (plan §2): the day clock drives the board ---------------
  // clock: in-game minutes 0..1440 (00:00 → 24:00), played over ~2 real min.
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Between rounds (round 2+): show the board-top "다음 이벤트" card.
  const [needEvent, setNeedEvent] = useState(false);
  // The "R{n} 종료" announcement shown when the clock hits 24:00.
  const [roundEndModal, setRoundEndModal] = useState<number | null>(null);
  const roundDataRef = useRef<RoundData | null>(null);
  const clockRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setClockBoth = useCallback((t: number) => {
    clockRef.current = t;
    setClock(t);
  }, []);

  /** Recompute the visible board + interpolated market at minute t. */
  const renderAt = useCallback((t: number) => {
    const rd = roundDataRef.current;
    if (!rd) return;
    setPosts(visiblePosts(rd, t));
    const mk = interpMarket(rd, t);
    if (mk) setMarketData(mk);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Play the current round's scenario from 00:00 to 24:00 over ~2 real min. */
  const startTimer = useCallback(() => {
    stopTimer();
    setPlaying(true);
    const startTs = performance.now();
    setClockBoth(0);
    renderAt(0);
    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - startTs;
      let t = (elapsed / ROUND_REAL_MS) * ROUND_MINUTES;
      if (t >= ROUND_MINUTES) {
        t = ROUND_MINUTES;
        setClockBoth(t);
        renderAt(t);
        stopTimer();
        setPlaying(false);
        setRoundEndModal(roundDataRef.current?.round ?? currentRound);
        return;
      }
      setClockBoth(t);
      renderAt(t);
    }, 60);
  }, [renderAt, setClockBoth, stopTimer, currentRound]);

  // Clean up the timer if the component unmounts mid-round.
  useEffect(() => () => stopTimer(), [stopTimer]);

  /** Optimistic seed so the panels aren't empty before live data arrives. */
  const seedFromSetup = useCallback(
    (setupAgents: Agent[], setupAssets: Asset[]) => {
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
      setCurrentRound(1);
      setClockBoth(0);
      setPlaying(false);
      setNeedEvent(false);
      setRoundEndModal(null);
      roundDataRef.current = null;
    },
    [setClockBoth]
  );

  const handleStart = useCallback(
    (setupAgents: Agent[], setupAssets: Asset[]) => {
      seedFromSetup(setupAgents, setupAssets);
      setCanonicalSim(null);
      setGameStarted(true);
      setRoundReport(null);
      setOverall(null);
      overallFetchedRef.current = false;
      autoEventShown.current = false;

      // Fork the reverie sim so the map renders immediately; agents start
      // wandering right away (the backend serves continuous random movement).
      const sim = `market_${Date.now()}`;
      control
        .start(FORK_SIM_CODE, sim)
        .then((res) => {
          setCanonicalSim(sim);
          if (res.uid) setSessionUid(res.uid);
        })
        .catch((err) => {
          console.warn("[MarketAquarium] canonical start failed:", err);
        });
    },
    [seedFromSetup]
  );

  // The map's movement updates carry only light meta now (round). The board /
  // market / emotion are driven by the timer, so this is a no-op.
  const handleTick = useCallback((_meta: ReverieMeta) => {}, []);

  // Submit an event -> generate the round (scenario) -> play the day timer.
  const handleEvent = useCallback(
    (text: string) => {
      if (computing || playing) return;
      setEventModalOpen(false);
      setNeedEvent(false);
      setComputing(true);
      control
        .marketEvent({ uid: sessionUid ?? undefined, text, is_rumor: false })
        .then((res) => {
          if (!res.state) {
            console.warn("[MarketAquarium] event returned no state", res.error);
            return;
          }
          const s = res.state;
          const rd: RoundData = {
            round: s.round,
            posts: s.posts,
            scenario: s.scenario,
            agents: s.agents,
            snsAgents: s.sns_agents,
            emotionDeltas: s.emotion_deltas,
            events: s.events,
            startMarket: res.start_market ?? null,
            finalMarket: res.final_market ?? s.market,
            roundReport: s.round_report,
            finished: s.finished,
          };
          roundDataRef.current = rd;
          setCurrentRound(rd.round);
          setAgents(rd.agents);
          setSnsAgents(rd.snsAgents);
          setEmotionDeltas(rd.emotionDeltas);
          setEvents(rd.events);
          if (rd.roundReport) setRoundReport(rd.roundReport);
          setActiveEvent({ text, impact: normalizeImpact(res.impact), source: "user" });
          startTimer();
        })
        .catch((err) => console.warn("[MarketAquarium] marketEvent failed:", err))
        .finally(() => setComputing(false));
    },
    [sessionUid, computing, playing, startTimer]
  );

  // Close the "R{n} 종료" modal: fetch the overall report after round 5, else
  // surface the board-top event card for the next round.
  const closeRoundEnd = useCallback(() => {
    const rd = roundDataRef.current;
    setRoundEndModal(null);
    setReportOpen(true); // reveal this round's detailed report
    if (rd?.finished) {
      if (!overallFetchedRef.current) {
        overallFetchedRef.current = true;
        control
          .overallReport(sessionUid ?? undefined)
          .then((r) => {
            if (r.report) setOverall(r.report);
          })
          .catch((err) => console.warn("[MarketAquarium] overall report:", err));
      }
    } else {
      setNeedEvent(true);
    }
  }, [sessionUid]);

  // D4: like/dislike — update the round source, then re-derive at the clock.
  const handleVote = useCallback(
    (input: { post_id: string; comment_id?: string; dir: "like" | "dislike" }) => {
      control
        .boardVote({ uid: sessionUid ?? undefined, ...input })
        .then((res) => {
          const rd = roundDataRef.current;
          if (res.posts && rd) {
            roundDataRef.current = { ...rd, posts: res.posts };
            setPosts(visiblePosts(roundDataRef.current, clockRef.current));
          }
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
          const rd = roundDataRef.current;
          if (rd) {
            roundDataRef.current = {
              ...rd,
              posts: res.posts ?? rd.posts,
              agents: res.agents ?? rd.agents,
              snsAgents: res.sns_agents ?? rd.snsAgents,
            };
            setPosts(visiblePosts(roundDataRef.current, clockRef.current));
          }
          if (res.agents) setAgents(res.agents);
          if (res.sns_agents) setSnsAgents(res.sns_agents);
          if (res.emotion_deltas) setEmotionDeltas(res.emotion_deltas);
        })
        .catch((err) => console.warn("[MarketAquarium] board post:", err));
    },
    [sessionUid]
  );

  const handleToggleReport = useCallback(() => setReportOpen((p) => !p), []);
  const handleZoomIn = useCallback(() => reverieControlsRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => reverieControlsRef.current?.zoomOut(), []);

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

  // Round 1 only: auto-open the first event-input modal once the sim is ready.
  useEffect(() => {
    if (gameStarted && canonicalSim && !autoEventShown.current) {
      autoEventShown.current = true;
      setEventModalOpen(true);
    }
  }, [gameStarted, canonicalSim]);

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
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

  // The board-top "다음 이벤트" card only appears between rounds (round 2+),
  // never while the day is playing or being computed.
  const requestNextEvent =
    needEvent && !playing && !computing ? handleEvent : undefined;

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-surface-primary">
      {/* Full-screen game map (canonical reverie viewer) */}
      <div className="absolute inset-0">
        {canonicalSim ? (
          <ReverieGame
            simCode={canonicalSim}
            uid={sessionUid ?? undefined}
            onTick={handleTick}
            controlsRef={reverieControlsRef}
            onSelectAgent={handleSelectAgent}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-white text-pixel-muted text-sm font-bold animate-pulse-soft">
            라이브 시뮬레이션을 준비하는 중...
          </div>
        )}
      </div>

      {/* HUD overlay (logo slot now shows the in-game clock) */}
      <GameHUD
        round={currentRound}
        clock={formatClock(clock)}
        playing={playing}
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
          <div className="bg-pixel-wall border-2 border-black rounded-2xl shadow-pixel-lg overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
            <MarketPanel data={marketData} />
          </div>
        </div>
      )}

      {/* Board feed - floating right */}
      {boardOpen && (
        <div className="absolute right-4 top-16 bottom-16 w-[370px] z-20">
          <div className="h-full overflow-hidden">
            <BoardFeed
              posts={posts}
              events={events}
              agents={agents}
              snsAgents={snsAgents}
              emotionDeltas={emotionDeltas}
              currentRound={currentRound}
              onPost={handlePost}
              onVote={handleVote}
              onRequestEvent={requestNextEvent}
            />
          </div>
        </div>
      )}

      {/* Round report - center modal */}
      {reportOpen && (
        <RoundReport report={reportForView} onClose={() => setReportOpen(false)} />
      )}

      {/* Round-1 event-input modal (auto-opens at start) */}
      {eventModalOpen && (
        <EventInputModal
          round={currentRound}
          onSubmit={handleEvent}
          onClose={() => setEventModalOpen(false)}
        />
      )}

      {/* Generating the round scenario (LLM) — the wait gate before the timer */}
      {computing && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-pixel-ink/60">
          <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg px-6 py-5 flex flex-col items-center gap-3 max-w-[320px]">
            <Loader2 size={28} className="text-pixel-greenText animate-spin" />
            <div className="text-sm font-bold text-black">시나리오 생성 중...</div>
            <div className="text-[11px] text-pixel-muted text-center leading-relaxed">
              에이전트들의 하루(00:00~24:00) 반응 순서를 짜고 있어요. 잠시만요.
            </div>
          </div>
        </div>
      )}

      {/* "R{n} 종료" announcement shown when the clock reaches 24:00 */}
      {roundEndModal !== null && (
        <RoundEndModal
          round={roundEndModal}
          finished={roundDataRef.current?.finished ?? false}
          onClose={closeRoundEnd}
        />
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

/** Round-1 event-input modal that auto-opens at game start. */
function EventInputModal({
  round,
  onSubmit,
  onClose,
}: {
  round: number;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-pixel-ink/60">
      <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg w-[460px] max-w-[90vw] p-5 animate-slide-up">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-pixel-greenText" />
          <span className="text-sm font-extrabold text-black tracking-wide">
            R{round} 이벤트 입력
          </span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-7 h-7 border-2 border-black rounded-lg bg-white flex items-center justify-center text-black hover:bg-pixel-danger hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-[12px] text-pixel-muted mb-3 leading-relaxed">
          시장에 던질 뉴스를 입력하세요. 에이전트들이 하루(00:00~24:00) 동안 이 이벤트에 반응합니다.
        </p>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="트럼프가 중국 반도체 관세를 예고했다..."
            autoFocus
            className="flex-1 bg-white border-2 border-black rounded-lg px-3 py-2 text-sm text-black placeholder:text-pixel-muted focus:outline-none focus:bg-pixel-path"
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="px-4 py-2 bg-pixel-grass border-2 border-black rounded-lg text-black text-sm font-bold hover:brightness-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]"
          >
            <Send size={13} />
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown when the day clock reaches 24:00 — the round is over. */
function RoundEndModal({
  round,
  finished,
  onClose,
}: {
  round: number;
  finished: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-pixel-ink/60">
      <div className="bg-white border-2 border-black rounded-2xl shadow-pixel-lg w-[420px] max-w-[90vw] p-6 animate-slide-up text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <CheckCircle2 size={20} className="text-pixel-greenText" />
          <span className="text-[18px] font-extrabold text-black tracking-tight">
            R{round} 종료
          </span>
        </div>
        <p className="text-[12px] text-pixel-muted mb-5 leading-relaxed">
          {finished
            ? "5라운드가 모두 끝났어요. 종합 리포트를 확인하세요."
            : "하루가 끝났습니다. 게시판 맨 위에서 다음 이벤트를 입력하세요."}
        </p>
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-pixel-grass border-2 border-black rounded-xl text-black text-sm font-extrabold hover:brightness-95 cursor-pointer active:translate-y-[1px] shadow-pixel-sm"
        >
          확인
        </button>
      </div>
    </div>
  );
}
