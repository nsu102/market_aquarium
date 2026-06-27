"""Bridge between the reverie cognitive loop and the market simulation modules.

Canonical integration (user decision "정석연동"): the reverie loop drives
movement AND behaviour. When a persona ARRIVES at the board (Hobbs Cafe) it does
an SNS view (read feed + one utterance + emotion contagion, FR-3); when it
arrives at the exchange (The Willows Market) it trades (FR-5). Prices update at
the end of each day (FR-7) and a round report is produced (FR-10).

This module holds a single MarketContext that maps each reverie persona name to a
tested `sim` Agent and reuses the already-tested market modules. It lives at the
backend_server top level so cognitive modules can `import market_bridge`.

The LLM client defaults to the scripted offline client, so the whole thing runs
live with NO API key (answering "why can't it run live"); set OPENROUTER_API_KEY
to use the real model.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the tested `sim` package importable from inside reverie.
_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from sim import credibility, emotion, market_state, price_engine, report, sns, trade  # noqa: E402
from sim.assets import assets_by_symbol, load_assets, load_sectors  # noqa: E402
from sim.llm import LLMClient, default_client, scripted_client  # noqa: E402
from sim.models import Event, EventImpact, Location, Post  # noqa: E402
from sim.personas import build_agent, get_persona  # noqa: E402

# reverie persona name (the_ville character) -> our market persona id.
CHARACTER_TO_PERSONA = {
    "Jane Moreno": "panic",
    "Eddy Lin": "fomo",
    "Klaus Mueller": "value",
    "Rajiv Patel": "quant",
    "Arthur Burton": "whale",
    "Wolfgang Schulz": "contrarian",
}

# Injected daily activities + the exact the_ville addresses they ground to.
BOARD_ACTIVITY = "checking the SNS board for market news"
EXCHANGE_ACTIVITY = "going to the exchange to trade"
BOARD_ADDRESS = "the Ville:Hobbs Cafe:cafe:cafe customer seating"
EXCHANGE_ADDRESS = "the Ville:The Willows Market and Pharmacy:store:grocery store counter"

IMPACT_BASE_PCT = {EventImpact.NEGATIVE: -3.0, EventImpact.POSITIVE: 3.0, EventImpact.NEUTRAL: 0.0}


def force_address(act_description: str | None) -> str | None:
    """If an activity is one of our injected slots, return its exact address so
    grounding does not depend on the (possibly key-less) LLM. Else None."""
    if not act_description:
        return None
    d = act_description.lower()
    if "sns board" in d or "board for market" in d:
        return BOARD_ADDRESS
    if "exchange to trade" in d or "to the exchange" in d:
        return EXCHANGE_ADDRESS
    return None


def classify_impact(text: str) -> EventImpact:
    neg = ["해킹", "폭락", "규제", "관세", "전쟁", "급락", "공포", "파산", "hack", "crash", "ban", "war"]
    pos = ["승인", "상승", "호재", "급등", "유입", "인하", "etf", "approval", "surge", "rally"]
    low = text.lower()
    if any(k in text or k in low for k in neg):
        return EventImpact.NEGATIVE
    if any(k in text or k in low for k in pos):
        return EventImpact.POSITIVE
    return EventImpact.NEUTRAL


class MarketContext:
    """Per-simulation market state, keyed by reverie persona name."""

    def __init__(self, persona_names: list[str], seed: int = 42, client: LLMClient | None = None):
        if client is not None:
            self.client = client
        else:
            real = default_client()
            self.client = real if real.available else scripted_client()
        self.seed = seed
        self.assets = load_assets()
        self.sectors = load_sectors()
        self._abs = assets_by_symbol(self.assets)
        prices = {a.symbol: a.price for a in self.assets}
        import random

        rng = random.Random(seed)
        # Build one market Agent per known reverie persona name.
        self.agents: dict[str, "object"] = {}
        for name in persona_names:
            pid = CHARACTER_TO_PERSONA.get(name)
            if pid is None:
                continue
            self.agents[name] = build_agent(get_persona(pid), prices, rng)

        self.posts: list[Post] = []
        self.events: list[Event] = []
        self.current_event: Event | None = None
        self.round: int = 0
        self._round_trades: list = []
        self._sns_done: set[str] = set()  # names that viewed SNS this round
        self._trade_done: set[str] = set()  # names that traded this round
        self._initial_state = {
            n: {"cash": a.cash, "net_worth": self._net_worth(a)} for n, a in self.agents.items()
        }
        self.market = market_state.compute_market_data(list(self.agents.values()), self.assets)
        self.round_reports: list = []

    # ------------------------------------------------------------------ #
    def _net_worth(self, agent) -> float:
        return agent.cash + sum(h.amount * h.avgPrice for h in agent.portfolio)

    def set_event(self, text: str, source: str = "user", is_rumor: bool = False,
                  cred_source: str | None = None, timestamp: str = "") -> Event:
        """FR-1: start a new round with the user's single event."""
        self.round += 1
        self._round_trades = []
        self._sns_done.clear()
        self._trade_done.clear()
        impact = classify_impact(text)
        ev = Event(id=f"e{self.round}", round=self.round, text=text, source=source,
                   impact=impact, timestamp=timestamp, is_rumor=is_rumor, cred_source=cred_source)
        self.current_event = ev
        self.events.insert(0, ev)
        # news-bot style headline post
        self.posts.insert(0, Post(id=f"p_event_{self.round}", agentId="system",
                                  agentAlias="시스템", content=f"[속보] {text}",
                                  timestamp=timestamp, round=self.round))
        # FR-2/FR-2b: credibility-gated direct emotion from the event
        for ag in self.agents.values():
            cred = credibility.generate_news_credibility(self.client, ag, text,
                                                         source=cred_source, is_rumor=is_rumor)
            if is_rumor and not credibility.is_credible(cred):
                continue
            emotion.apply_emotion_delta(ag, emotion.generate_emotion_delta(self.client, ag, ev))
        return ev

    def on_arrive_board(self, name: str, timestamp: str = "") -> None:
        """FR-3: persona arrived at Hobbs Cafe -> view SNS once this round."""
        ag = self.agents.get(name)
        if ag is None or self.current_event is None or name in self._sns_done:
            return
        self._sns_done.add(name)
        ag.location = Location.COMMUNITY
        result = sns.view_sns(self.client, ag, self.current_event, self.posts,
                              self.round, timestamp=timestamp)
        sns.apply_sns_write(result.write, ag, self.posts, self.round, timestamp=timestamp)
        # contagion: most salient post from someone else nudges emotion
        others = [p for p in self.posts if p.round == self.round
                  and p.agentId not in ("system", ag.id) and p.content]
        if others:
            top = max(others, key=lambda p: p.likes + len(p.comments))
            emotion.apply_emotion_delta(ag, emotion.generate_emotion_delta_from_text(self.client, ag, top.content))

    def on_arrive_exchange(self, name: str) -> None:
        """FR-5: persona arrived at The Willows Market -> trade once this round."""
        ag = self.agents.get(name)
        if ag is None or name in self._trade_done:
            return
        self._trade_done.add(name)
        ag.location = Location.EXCHANGE
        decision = trade.decide_trade(ag, self._abs, self.market)
        result = trade.execute_trade(decision, ag, self._abs)
        self._round_trades.append(result)

    def end_round(self) -> "object":
        """FR-7/FR-10: apply price distortion + build the round report."""
        breakdowns = []
        for i, asset in enumerate(self.assets):
            b = price_engine.compute_price_change(
                asset, IMPACT_BASE_PCT.get(self.current_event.impact if self.current_event else EventImpact.NEUTRAL, 0.0),
                list(self.agents.values()), self._round_trades, seed=self.seed + self.round * 1000 + i)
            price_engine.apply_breakdown(asset, b)
            breakdowns.append(b)
        posts_this = len([p for p in self.posts if p.round == self.round])
        self.market = market_state.compute_market_data(
            list(self.agents.values()), self.assets, self._round_trades, posts_count=posts_this)
        rr = report.build_round_report(self.round, self.market, breakdowns,
                                       list(self.agents.values()), self._round_trades)
        self.round_reports.append(rr)
        return rr

    def overall_report(self):
        achievements = report.award_achievements(list(self.agents.values()), self._initial_state)
        return report.build_overall_report(self.round_reports, list(self.agents.values()), achievements)

    def snapshot(self) -> dict:
        return {
            "round": self.round,
            "agents": [a.model_dump() for a in self.agents.values()],
            "market": self.market.model_dump(),
            "posts": [p.model_dump() for p in self.posts],
            "events": [e.model_dump() for e in self.events],
            "sectors": self.sectors,
        }


# --------------------------------------------------------------------------- #
# Single global context the reverie modules talk to.
# --------------------------------------------------------------------------- #
_CTX: MarketContext | None = None


def get_context() -> MarketContext | None:
    return _CTX


def set_context(ctx: MarketContext | None) -> None:
    global _CTX
    _CTX = ctx


def init_context(persona_names: list[str], seed: int = 42, client: LLMClient | None = None) -> MarketContext:
    ctx = MarketContext(persona_names, seed=seed, client=client)
    set_context(ctx)
    return ctx
