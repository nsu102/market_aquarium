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

from concurrent.futures import ThreadPoolExecutor

from . import credibility, emotion, market_state, price_engine, report, sns, trade
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
from .personas import sample_agents

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
        self.agents: list[Agent] = sample_agents(num_agents, seed=seed, prices=prices)
        self.posts: list[Post] = []
        self.events: list[Event] = []
        self.round: int = 0
        self.round_reports: list[RoundReport] = []
        self.last_round_actions: list[dict] = []
        self.market: MarketData = market_state.compute_market_data(self.agents, self.assets)
        # snapshot for end-of-game achievements (best performer)
        self._initial_state = {
            a.id: {"cash": a.cash, "net_worth": self._net_worth(a)} for a in self.agents
        }

    # ------------------------------------------------------------------ #
    def _net_worth(self, agent: Agent) -> float:
        held = sum(h.amount * h.avgPrice for h in agent.portfolio)
        return agent.cash + held

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
    ) -> RoundReport:
        """Advance one round given the user's single event (FR-1 .. FR-8)."""
        if self.finished:
            raise RuntimeError("simulation already finished (5 rounds)")
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

        # News bot broadcasts the headline as the seed post of the round.
        self._broadcast_event_post(event, ts)

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

        with ThreadPoolExecutor(max_workers=8) as _ex:
            _deltas = list(_ex.map(_emotion_delta, self.agents))
        for ag, d in zip(self.agents, _deltas):
            if d is not None:
                emotion.apply_emotion_delta(ag, d)

        # --- FR-3: each agent visits the board, reads the feed, writes once ---
        # Posts are grounded in each agent's interested assets/sectors (their holdings).
        sym2sector = {a.symbol: a.sector for a in self.assets}
        for ag in self.agents:
            ag.location = Location.COMMUNITY
            interests = [h.asset for h in ag.portfolio if h.amount > 0][:4]
            sectors = list(dict.fromkeys(s for s in (sym2sector.get(x, "") for x in interests) if s))
            result = sns.view_sns(
                self.client, ag, event, self.posts, rnd, timestamp=ts,
                interests=interests, sectors=sectors,
            )
            sns.apply_sns_write(result.write, ag, self.posts, rnd, timestamp=ts)

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
        breakdowns = []
        for i, asset in enumerate(self.assets):
            b = price_engine.compute_price_change(
                asset,
                IMPACT_BASE_PCT.get(impact, 0.0),
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
                "traded": bool(tr and tr.action.value != "HOLD"),
            })
        return rr

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

        with ThreadPoolExecutor(max_workers=8) as ex:
            deltas = list(ex.map(_delta, self.agents))
        for ag, d in zip(self.agents, deltas):
            if d is not None:
                emotion.apply_emotion_delta(ag, d)

    # ------------------------------------------------------------------ #
    def overall_report(self) -> OverallReport:
        prices = {a.symbol: a.price for a in self.assets}
        achievements = report.award_achievements(self.agents, self._initial_state, prices)
        return report.build_overall_report(self.round_reports, self.agents, achievements)

    def state(self) -> dict:
        """FE-facing snapshot (shapes mirror frontend mock_data types)."""
        return {
            "round": self.round,
            "max_rounds": MAX_ROUNDS,
            "finished": self.finished,
            "agents": [a.model_dump() for a in self.agents],
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
        }
