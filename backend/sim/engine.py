"""Round orchestration — the walking skeleton of the Market Aquarium loop.

This composes the FR modules into the core thesis flow per round:

    event -> emotion change -> board posts (contagion) -> trades -> price
    distortion -> round report

It is intentionally decoupled from the reverie cognitive loop / Phaser movement
(that integration is a later phase). The LLM client is injectable so the whole
round is deterministic when mocked (PRD §2.3 test_round_reproducible_with_mocked_llm).
Without an API key the real client fails safe to neutral defaults, so the game
still runs end-to-end offline.
"""

from __future__ import annotations

import random
from concurrent.futures import ThreadPoolExecutor

from . import branch, credibility, emotion, market_state, price_engine, report, sns, trade
from .assets import assets_by_symbol, load_assets, load_sectors
from .llm import LLMClient, default_client, scripted_client
from .models import (
    Achievement,
    Agent,
    Event,
    EventImpact,
    Location,
    MarketData,
    OverallReport,
    Post,
    RoundReport,
)
from .personas import sample_agents, sample_sns_agents

MAX_ROUNDS = 5

# Event impact -> base price shock %, before agent/emotion/order/noise effects (FR-7).
IMPACT_BASE_PCT = {
    EventImpact.NEGATIVE: -3.0,
    EventImpact.POSITIVE: 3.0,
    EventImpact.NEUTRAL: 0.0,
}

_ACTION_BUBBLE = {
    "BUY": "매수",
    "SELL": "매도",
    "BUY_LARGE": "대량매수",
    "HOLD": "",
}

# FR-Daily Plan (§5.1): per-persona-type template plan shown at day start.
_PLAN_TEMPLATES = {
    "panic_seller": "게시판에서 분위기 확인 → 악재면 거래소로 달려가 손절",
    "fomo_trader": "상승 신호 포착 → 거래소에서 추격 매수",
    "value_investor": "뉴스 신뢰도 확인 → 과매도면 매수, 루머엔 관망",
    "quant": "지표·변동성 점검 → 신호대로 기계적 매매",
    "whale": "대중 공포 관찰 → 거래소에서 대량 매집",
    "contrarian": "군중과 반대로 → 공포엔 매수, 탐욕엔 매도",
    "news_bot": "뉴스 요약 → 게시판에 공유",
    "conspiracy": "불확실 이벤트 탐색 → 자극적 해석 게시",
}


def _plan_for(agent: Agent) -> str:
    return _PLAN_TEMPLATES.get(agent.type, "게시판 확인 → 거래소에서 매매 판단")


def classify_impact(text: str) -> EventImpact:
    """Cheap keyword heuristic so a bare event text gets a sane base shock.

    Used only when the caller does not specify an impact. Real impact is shaped
    by agent emotion/trades on top of this.
    """
    neg = ["해킹", "폭락", "규제", "관세", "전쟁", "급락", "공포", "파산", "hack", "crash", "ban", "war"]
    pos = ["승인", "상승", "호재", "급등", "유입", "인하", "etf", "approval", "surge", "rally"]
    low = text.lower()
    if any(k in text or k in low for k in neg):
        return EventImpact.NEGATIVE
    if any(k in text or k in low for k in pos):
        return EventImpact.POSITIVE
    return EventImpact.NEUTRAL


class GameSession:
    """Holds all mutable game state for one simulation run."""

    def __init__(
        self,
        num_agents: int = 6,
        seed: int = 42,
        client: LLMClient | None = None,
        assets=None,
        preset_indices: dict[str, int] | None = None,
    ):
        self.seed = seed
        self.num_agents = num_agents
        if client is not None:
            self.client = client
        else:
            real = default_client()
            # No API key -> use the scripted offline client so the demo stays lively.
            self.client = real if real.available else scripted_client()
        self.assets = assets if assets is not None else load_assets()
        self.sectors = load_sectors()
        prices = {a.symbol: a.price for a in self.assets}
        self.agents: list[Agent] = sample_agents(num_agents, seed=seed, prices=prices, preset_indices=preset_indices)
        # SNS-only spectators (D2): board-only crowd, as many as the players.
        self.sns_agents: list[Agent] = sample_sns_agents(num_agents)
        self.posts: list[Post] = []
        self.events: list[Event] = []
        self.round: int = 0
        self.round_reports: list[RoundReport] = []
        self.last_round_actions: list[dict] = []
        # Plan §2: the current round's time-ordered action schedule (post/comment/
        # like/dislike, each with a minute t in [0,1440]) the frontend timer
        # replays over ~2 real minutes. Rebuilt every run_round.
        self.scenario: dict | None = None
        # Emotion snapshot at the start of the current round, for the 감정 탭 delta.
        self.emotion_prev: dict[str, dict] = {}
        # Net (like-dislike) already applied to confidence per post/comment id, so
        # repeated settlements only apply the *new* votes (incl. user votes).
        self._vote_settled: dict[str, int] = {}
        self.market: MarketData = market_state.compute_market_data(self.agents, self.assets)
        # snapshot for end-of-game achievements (best performer)
        self._initial_state = {
            a.id: {"cash": a.cash, "net_worth": self._net_worth(a)} for a in self.agents
        }
        # FR-Branch: per-protagonist arc trail -> end-of-game endings/ghosts.
        self.arc = branch.ArcTracker(self.agents, prices)

    @classmethod
    def restore(cls, saved: dict, assets=None, seed: int = 42) -> "GameSession":
        """Reconstruct a GameSession from a saved state() dict."""
        session = cls.__new__(cls)
        session.seed = seed
        session.num_agents = len(saved.get("agents", []))
        real = default_client()
        session.client = real if real.available else scripted_client()
        session.assets = assets if assets is not None else load_assets()
        session.sectors = saved.get("sectors", load_sectors())
        session.agents = [Agent(**a) for a in saved.get("agents", [])]
        session.posts = [Post(**p) for p in saved.get("posts", [])]
        session.events = [Event(**e) for e in saved.get("events", [])]
        session.round = saved.get("round", 0)
        session.round_reports = []
        session.last_round_actions = []
        session.market = MarketData(**saved["market"]) if saved.get("market") else market_state.compute_market_data(session.agents, session.assets)
        session._initial_state = {
            a.id: {"cash": a.cash, "net_worth": session._net_worth(a)} for a in session.agents
        }
        # FR-Branch: arc trail starts fresh on restore (pre-resume rounds not replayed).
        session.arc = branch.ArcTracker(
            session.agents, {a.symbol: a.price for a in session.assets}
        )
        return session

    # ------------------------------------------------------------------ #
    def _net_worth(self, agent: Agent) -> float:
        held = sum(h.amount * h.avgPrice for h in agent.portfolio)
        return agent.cash + held

    _EMO_AXES = ("fear", "greed", "confidence", "excitement", "trust")

    def _all_agents(self) -> list[Agent]:
        """Players + SNS spectators (board/emotion phases touch both)."""
        return self.agents + self.sns_agents

    def _emo_snapshot(self, agent: Agent) -> dict:
        return {axis: getattr(agent, axis) for axis in self._EMO_AXES}

    def _settle_votes(self) -> None:
        """D3: turn accumulated (like − dislike) on each agent's own posts and
        comments into a confidence shift. Only the *new* votes since the last
        settlement are applied, so interactive user votes count exactly once."""
        by_agent: dict[str, int] = {}
        agent_by_id = {a.id: a for a in self._all_agents()}
        for post in self.posts:
            items = [(post.id, post.agentId, post.likes - post.dislikes)]
            items += [(c.id, c.agentId, c.likes - c.dislikes) for c in post.comments if c.id]
            for cid, aid, net in items:
                d = net - self._vote_settled.get(cid, 0)
                if d:
                    by_agent[aid] = by_agent.get(aid, 0) + d
                    self._vote_settled[cid] = net
        for aid, net in by_agent.items():
            ag = agent_by_id.get(aid)
            if ag is not None:
                emotion.apply_vote_emotion(ag, net)

    def _cast_sns_votes(self, rnd: int) -> list[dict]:
        """D2/D4: every SNS spectator likes a post (and sometimes dislikes one)
        this round, so net votes accumulate and feed confidence next round.

        Returns the ordered vote events ({post_id, comment_id, dir}) so the
        scenario builder can trickle each like/dislike in over the timer; the
        final counts are applied here so settlement/emotion stay unchanged.
        """
        events: list[dict] = []
        round_posts = [p for p in self.posts if p.round == rnd]
        if not round_posts:
            return events
        for ag in self.sns_agents:
            rng = random.Random((hash(ag.id) & 0xFFFFFFFF) ^ (self.seed + rnd * 7919))
            targets = [p for p in round_posts if p.agentId != ag.id] or round_posts
            like_p = rng.choice(targets)
            like_p.likes += 1
            events.append({"post_id": like_p.id, "comment_id": None, "dir": "like"})
            others = [p for p in targets if p.id != like_p.id]
            # provocative / fearful spectators are quicker to dislike
            dislike_bias = 0.6 if ag.type in ("conspiracy", "panic_seller", "contrarian") else 0.3
            if others and rng.random() < dislike_bias:
                dp = rng.choice(others)
                dp.dislikes += 1
                events.append({"post_id": dp.id, "comment_id": None, "dir": "dislike"})
        return events

    @property
    def finished(self) -> bool:
        return self.round >= MAX_ROUNDS

    # ------------------------------------------------------------------ #
    def run_round(
        self,
        text: str,
        impact: EventImpact | None = None,
        source: str = "user",
        is_rumor: bool = False,
        cred_source: str | None = None,
        timestamp: str | None = None,
        base_shock: float | None = None,
    ) -> RoundReport:
        """Advance one round given the user's single event (FR-1 .. FR-8).

        ``base_shock`` (a signed %) overrides the impact-derived event term when a
        card supplies its own shock seed (FR-Branch); else IMPACT_BASE_PCT is used.
        """
        if self.finished:
            raise RuntimeError("simulation already finished (5 rounds)")
        # Snapshot every axis BEFORE this round's changes so the 감정 탭 can show
        # the per-round delta, then settle last round's votes into confidence.
        self.emotion_prev = {a.id: self._emo_snapshot(a) for a in self._all_agents()}
        self._settle_votes()
        self.round += 1
        rnd = self.round
        ts = timestamp or f"Day{rnd} 09:00"
        impact = impact or classify_impact(text)
        event = Event(
            id=f"e{rnd}",
            round=rnd,
            text=text,
            source=source,
            impact=impact,
            timestamp=ts,
            is_rumor=is_rumor,
            cred_source=cred_source,
        )
        self.events.insert(0, event)

        # The event is shown ONLY as the single NEWS card in the UI (D: no extra
        # system 속보 post in the feed). Agents open their own threads instead.

        # --- FR-2b / FR-2: credibility-gated emotion change from the event ---
        # Per-agent and independent -> run the LLM calls concurrently (these are
        # I/O-bound), then apply the deltas sequentially. ~6x faster than serial.
        def _emotion_delta(ag):
            cred = credibility.generate_news_credibility(
                self.client, ag, text, source=cred_source, is_rumor=is_rumor
            )
            if is_rumor and not credibility.is_credible(cred):
                return None  # skeptical persona ignores a low-trust rumor (FR-4 spirit)
            return emotion.generate_emotion_delta(self.client, ag, event)

        # Players AND SNS spectators react emotionally to the event (D3: all axes
        # move for everyone shown in the 감정 탭).
        emo_targets = self._all_agents()
        with ThreadPoolExecutor(max_workers=8) as _ex:
            _deltas = list(_ex.map(_emotion_delta, emo_targets))
        for ag, d in zip(emo_targets, _deltas):
            if d is not None:
                emotion.apply_emotion_delta(ag, d)

        # --- FR-3 / D2: each agent visits the board and writes once. Players are
        # grounded in their holdings; SNS spectators are forced to speak. ---
        # Board spread: aim for ~half the writers to open a thread and ~half to
        # comment. The floor avoids one giant pile-on; the cap guarantees real
        # discussion instead of N isolated posts.
        total_writers = len(self.agents) + len(self.sns_agents)
        min_threads = max(3, total_writers // 4)
        max_threads = max(min_threads + 1, total_writers // 2)
        sym2sector = {a.symbol: a.sector for a in self.assets}
        # Plan §2: the round's first two agents may ONLY post (post_only), so the
        # board always opens with real threads to comment on / vote for.
        for i, ag in enumerate(self.agents):
            ag.location = Location.COMMUNITY
            interests = [h.asset for h in ag.portfolio if h.amount > 0][:4]
            sectors = list(dict.fromkeys(s for s in (sym2sector.get(x, "") for x in interests) if s))
            result = sns.view_sns(
                self.client, ag, event, self.posts, rnd, timestamp=ts,
                interests=interests, sectors=sectors, post_only=(i < 2),
                min_round_threads=min_threads, max_round_threads=max_threads,
            )
            sns.apply_sns_write(result.write, ag, self.posts, rnd, timestamp=ts)
        for ag in self.sns_agents:
            result = sns.view_sns(
                self.client, ag, event, self.posts, rnd, timestamp=ts, force=True,
                min_round_threads=min_threads, max_round_threads=max_threads,
            )
            sns.apply_sns_write(result.write, ag, self.posts, rnd, timestamp=ts)

        # SNS spectators cast their like/dislike votes on this round's posts.
        vote_events = self._cast_sns_votes(rnd)

        # --- contagion: reading others' posts nudges fear/greed (FR-3 spirit) ---
        self._apply_contagion(rnd)

        # --- FR-5: trades at the exchange (after SNS) ---
        # The action is decided by the LLM ("행동 결정까지 LLM"), true to each
        # persona's type + fear/greed + the event; it falls back to the
        # deterministic rule per-agent on any LLM failure so a trade always
        # resolves and the offline/mocked paths stay reproducible.
        abs_ = assets_by_symbol(self.assets)
        market_pre = market_state.compute_market_data(self.agents, self.assets)
        trades = trade.run_trades_llm(self.client, self.agents, abs_, market_pre, event)
        for ag in self.agents:
            ag.location = Location.EXCHANGE
            ag.bubble = _ACTION_BUBBLE.get(ag.lastAction, "")

        # --- FR-7: price distortion from event + order pressure + emotion + noise ---
        # A card supplies its own base_shock; bare events fall back to IMPACT_BASE_PCT.
        event_base = base_shock if base_shock is not None else IMPACT_BASE_PCT.get(impact, 0.0)
        breakdowns = []
        for i, asset in enumerate(self.assets):
            b = price_engine.compute_price_change(
                asset,
                event_base,
                self.agents,
                trades,
                seed=self.seed + rnd * 1000 + i,
            )
            price_engine.apply_breakdown(asset, b)
            breakdowns.append(b)

        # --- FR-10: aggregate indices + round report ---
        self.market = market_state.compute_market_data(
            self.agents, self.assets, trades, posts_count=len([p for p in self.posts if p.round == rnd])
        )
        rr = report.build_round_report(rnd, self.market, breakdowns, self.agents, trades)
        self.round_reports.append(rr)

        # FR-Branch: snapshot each protagonist's marked-to-market state + the
        # round's market regime (fear/greed) for end-of-game ending resolution.
        self.arc.update(
            rnd, self.agents, self.market.fearGreedIndex,
            {a.symbol: a.price for a in self.assets},
        )

        # Per-agent round summary so the frontend can choreograph movement:
        # who walked to the board (and what they posted) and to the exchange
        # (and how they traded) this round.
        self.last_round_actions = []
        for ag in self.agents:
            my_posts = [p for p in self.posts if p.round == rnd and p.agentId == ag.id]
            tr = next((t for t in trades if t.agent_id == ag.id), None)
            self.last_round_actions.append({
                "agent_id": ag.id,
                "alias": ag.alias,
                "posted": bool(my_posts),
                "post_text": my_posts[-1].content if my_posts else None,
                "trade_action": tr.action.value if tr else "HOLD",
                "trade_symbol": tr.symbol if tr else None,
                "trade_qty": tr.qty if tr else 0.0,
                "trade_price": tr.price if tr else 0.0,
                "trade_cash_after": tr.cash_after if tr else ag.cash,
                "traded": bool(tr and tr.action.value != "HOLD"),
            })

        # Plan §2: time-ordered action schedule the frontend timer replays.
        self.scenario = self._build_scenario(rnd, vote_events)
        return rr

    # ------------------------------------------------------------------ #
    def _build_scenario(self, rnd: int, vote_events: list[dict]) -> dict:
        """Order this round's posts → comments → votes into a timed action list
        (minute t in [0,1440]). The first two agents' posts lead (earliest t);
        every comment/vote is placed AFTER the item it references appears, so the
        timer never reveals a reply before its thread."""
        round_posts = [p for p in self.posts if p.round == rnd]
        openers = [a.id for a in self.agents[:2]]

        def _rank(p):
            return (openers.index(p.agentId) if p.agentId in openers
                    else len(openers) + round_posts.index(p))

        ordered_posts = sorted(round_posts, key=_rank)

        actions: list[dict] = []
        appear: dict[str, int] = {}  # post/comment id -> minute it shows up

        n = len(ordered_posts)
        for i, p in enumerate(ordered_posts):
            t = int(30 + (i + 1) / (n + 1) * 540)          # posts: 30..570
            appear[p.id] = t
            actions.append({"t": t, "kind": "post", "post_id": p.id, "comment_id": None})

        comments = [(p, c) for p in self.posts for c in p.comments
                    if getattr(c, "round", rnd) == rnd and c.id]
        nc = len(comments)
        for i, (p, c) in enumerate(comments):
            base = int(400 + (i + 1) / (nc + 1) * 900)      # comments: 400..1300
            t = min(1440, max(base, appear.get(p.id, 0) + 20))
            appear[c.id] = t
            actions.append({"t": t, "kind": "comment", "post_id": p.id, "comment_id": c.id})

        nv = len(vote_events)
        for i, ve in enumerate(vote_events):
            base = int(500 + (i + 1) / (nv + 1) * 940)      # votes: 500..1440
            ref = appear.get(ve["comment_id"] or ve["post_id"], 0)
            t = min(1440, max(base, ref + 10))
            actions.append({"t": t, "kind": ve["dir"],
                            "post_id": ve["post_id"], "comment_id": ve["comment_id"]})

        actions.sort(key=lambda a: a["t"])
        return {"round": rnd, "duration_min": 1440, "actions": actions}

    # ------------------------------------------------------------------ #
    def _broadcast_event_post(self, event: Event, ts: str) -> None:
        bot = next((a for a in self.agents if a.type == "news_bot"), None)
        agent_id = bot.id if bot else "system"
        alias = bot.alias if bot else "시스템"
        self.posts.insert(
            0,
            Post(
                id=f"p_event_{event.round}",
                agentId=agent_id,
                agentAlias=alias,
                content=f"[속보] {event.text}",
                likes=0,
                comments=[],
                timestamp=ts,
                round=event.round,
            ),
        )

    def _apply_contagion(self, rnd: int) -> None:
        """Each agent's emotion is nudged by the most salient post from someone else."""
        round_posts = [p for p in self.posts if p.round == rnd and p.agentId != "system"]
        if not round_posts:
            return

        def _delta(ag):
            others = [p for p in round_posts if p.agentId != ag.id and p.content]
            if not others:
                return None
            top = max(others, key=lambda p: p.likes + len(p.comments))
            return emotion.generate_emotion_delta_from_text(self.client, ag, top.content)

        targets = self._all_agents()
        with ThreadPoolExecutor(max_workers=8) as ex:
            deltas = list(ex.map(_delta, targets))
        for ag, d in zip(targets, deltas):
            if d is not None:
                emotion.apply_emotion_delta(ag, d)

    # ------------------------------------------------------------------ #
    def overall_report(self) -> OverallReport:
        prices = {a.symbol: a.price for a in self.assets}
        achievements = report.award_achievements(self.agents, self._initial_state, prices)
        endings = self.arc.endings(self.agents)
        return report.build_overall_report(
            self.round_reports, self.agents, achievements, endings
        )

    def _emotion_deltas(self) -> dict[str, dict]:
        """Per-agent change of each axis vs the start of the current round."""
        out: dict[str, dict] = {}
        for a in self._all_agents():
            prev = self.emotion_prev.get(a.id)
            cur = self._emo_snapshot(a)
            if prev is None:
                out[a.id] = {axis: 0.0 for axis in self._EMO_AXES}
            else:
                out[a.id] = {axis: round(cur[axis] - prev[axis], 1) for axis in self._EMO_AXES}
        return out

    def state(self) -> dict:
        """FE-facing snapshot (shapes mirror frontend mock_data types)."""
        return {
            "round": self.round,
            "max_rounds": MAX_ROUNDS,
            "finished": self.finished,
            "agents": [a.model_dump() for a in self.agents],
            # SNS-only spectators (D2): board avatars, never on the map.
            "sns_agents": [a.model_dump() for a in self.sns_agents],
            "emotion_deltas": self._emotion_deltas(),
            "market": self.market.model_dump(),
            "posts": [p.model_dump() for p in self.posts],
            "events": [e.model_dump() for e in self.events],
            "sectors": self.sectors,
            # FR-Daily Plan: per-agent template plan (shown at the bottom of the UI).
            "plans": [
                {"agent_id": a.id, "alias": a.alias, "type": a.type, "plan": _plan_for(a)}
                for a in self.agents
            ],
            # FR-10: the real latest round report (replaces the frontend mock).
            "round_report": self.round_reports[-1].model_dump() if self.round_reports else None,
            # Plan §2: the current round's timer schedule (post/comment/vote @ t).
            "scenario": self.scenario,
        }
