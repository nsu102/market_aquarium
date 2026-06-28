"""Shared domain models for the Market Aquarium simulation.

This module is the single source of truth for the data contract between the
simulation engine, the FastAPI surface, and the Next.js frontend. The field
names mirror the frontend mock_data types (frontend/mock_data/*.ts) so the UI
can swap mock data for API responses with minimal churn.

Pydantic v2 BaseModel is used throughout for free FastAPI (de)serialization.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class AgentType(str, Enum):
    PANIC_SELLER = "panic_seller"
    FOMO_TRADER = "fomo_trader"
    VALUE_INVESTOR = "value_investor"
    QUANT = "quant"
    WHALE = "whale"
    NEWS_BOT = "news_bot"
    CONTRARIAN = "contrarian"
    CONSPIRACY = "conspiracy"


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    BUY_LARGE = "BUY_LARGE"


class Location(str, Enum):
    HOME = "home"
    COMMUNITY = "community"  # board / SNS
    EXCHANGE = "exchange"


class EventImpact(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


class WriteKind(str, Enum):
    POST = "POST"
    COMMENT = "COMMENT"
    REPLY = "REPLY"
    SKIP = "SKIP"


# --------------------------------------------------------------------------- #
# Static / reference data
# --------------------------------------------------------------------------- #
class Asset(BaseModel):
    """A tradeable asset. Mirrors frontend Asset (mock_data/market.ts)."""

    symbol: str
    name: str
    price: float
    change24h: float = 0.0
    volume: float = 0.0
    priceHistory: list[float] = Field(default_factory=list)
    sector: str = ""


class PortfolioHolding(BaseModel):
    """Mirrors frontend Agent.portfolio entry."""

    asset: str
    amount: float
    avgPrice: float


class Position(BaseModel):
    x: int = 0
    y: int = 0


# --------------------------------------------------------------------------- #
# Persona pool (static character definition) vs Agent (runtime state)
# --------------------------------------------------------------------------- #
class Persona(BaseModel):
    """A character template in the 20-persona pool.

    Personality is expressed purely as scratch text fields (innate/learned/
    currently/lifestyle/daily_req) per PRD §3.1 — these are injected into LLM
    prompts so tone (panic/cautious/hype) is generated for free.
    """

    persona_id: str
    alias: str  # SNS nickname e.g. "손절 금붕어"
    type: AgentType
    sprite: str
    color: str

    # scratch personality text (English; output asked in Korean)
    innate: str
    learned: str
    currently: str
    lifestyle: str
    daily_req: str

    # candidate pools — one is sampled (seeded) at game setup. No LLM.
    cash_pool: list[float]
    portfolio_symbol_pool: list[str]

    default_fear: float = 50.0
    default_greed: float = 50.0
    # Seed defaults for the detail axes (D3/7): persona-fixed starting points,
    # then nudged by the per-event LLM measurement. fear/greed stay the primary
    # axes; these three are persona-seeded, not user-set.
    default_confidence: float = 50.0
    default_excitement: float = 50.0
    default_trust: float = 50.0

    # optional behavioural sensitivities (0..1)
    herd_sensitivity: float = 0.5
    rumor_sensitivity: float = 0.5
    fear_threshold: float | None = None


class Agent(BaseModel):
    """Runtime agent state. Mirrors frontend Agent (mock_data/agents.ts)."""

    id: str
    alias: str
    type: str
    sprite: str
    cash: float
    portfolio: list[PortfolioHolding] = Field(default_factory=list)
    fear: float = 50.0
    greed: float = 50.0
    # Extra emotion axes (D3): each 0..100, 50 = neutral midpoint.
    confidence: float = 50.0   # 자신감 ↔ 위축 (driven by likes − dislikes)
    excitement: float = 50.0   # 흥분 ↔ 침착 (driven by hype/volatility)
    trust: float = 50.0        # 신뢰 ↔ 의심 (driven by news credibility/rumors)
    # SNS-only agents live only on the board (no map/movement/trade).
    sns_only: bool = False
    lastAction: str = "HOLD"
    location: Location = Location.HOME
    position: Position = Field(default_factory=Position)
    bubble: str = ""
    color: str = "#888888"

    # scratch personality (kept server-side, not strictly needed by FE)
    innate: str = ""
    learned: str = ""
    currently: str = ""
    lifestyle: str = ""
    daily_req: str = ""
    herd_sensitivity: float = 0.5
    rumor_sensitivity: float = 0.5
    fear_threshold: float | None = None

    def holding(self, symbol: str) -> PortfolioHolding | None:
        for h in self.portfolio:
            if h.asset == symbol:
                return h
        return None


# --------------------------------------------------------------------------- #
# Events, posts (board), emotion
# --------------------------------------------------------------------------- #
class Event(BaseModel):
    """User-input event. Mirrors frontend GameEvent (mock_data/events.ts)."""

    id: str
    round: int
    text: str
    source: str = "user"
    impact: EventImpact = EventImpact.NEUTRAL
    timestamp: str = ""
    is_rumor: bool = False
    cred_source: str | None = None  # provenance for credibility judging


class Comment(BaseModel):
    id: str = ""
    agentId: str
    agentAlias: str
    content: str
    likes: int = 0
    dislikes: int = 0
    is_user: bool = False
    mentions: list[str] = Field(default_factory=list)
    round: int = 1


class Post(BaseModel):
    """Board post. Mirrors frontend Post (mock_data/posts.ts).

    A thread is a Post plus its accumulated comments (the curr_chat analogue).
    """

    id: str
    agentId: str
    agentAlias: str
    content: str
    asset: str | None = None
    sector: str = ""
    symbol_tags: list[str] = Field(default_factory=list)
    likes: int = 0
    dislikes: int = 0
    comments: list[Comment] = Field(default_factory=list)
    is_user: bool = False
    mentions: list[str] = Field(default_factory=list)
    timestamp: str = ""
    round: int = 1


class EmotionDelta(BaseModel):
    """FR-2: LLM-returned emotion delta across the 5 axes (D3).

    fear/greed feed the price/state formula; the extra three axes (confidence,
    excitement, trust) are surfaced in the 감정 탭 and nudged by the same stimuli.
    """

    fear_delta: float = 0.0
    greed_delta: float = 0.0
    confidence_delta: float = 0.0
    excitement_delta: float = 0.0
    trust_delta: float = 0.0


class InjectedThought(BaseModel):
    """FR-3: a thought node injected into associative memory when viewing SNS."""

    text: str
    poignancy: float
    created: str = ""


class SnsWrite(BaseModel):
    """FR-3: the single utterance produced per SNS view (or SKIP)."""

    kind: WriteKind = WriteKind.SKIP
    text: str | None = None
    target_thread_id: str | None = None
    sector: str = ""
    symbol_tags: list[str] = Field(default_factory=list)


class SnsResult(BaseModel):
    injected_thoughts: list[InjectedThought] = Field(default_factory=list)
    write: SnsWrite = Field(default_factory=SnsWrite)


# --------------------------------------------------------------------------- #
# Trading & price
# --------------------------------------------------------------------------- #
class TradeDecision(BaseModel):
    agent_id: str
    action: Action = Action.HOLD
    symbol: str | None = None
    qty: float = 0.0
    reason: str = ""


class TradeResult(BaseModel):
    agent_id: str
    action: Action
    symbol: str | None = None
    qty: float = 0.0
    price: float = 0.0
    cash_after: float = 0.0


class PriceBreakdown(BaseModel):
    """FR-7: components that sum to the price change %."""

    symbol: str
    event_impact: float = 0.0
    order_pressure: float = 0.0
    emotion_overheat: float = 0.0
    noise: float = 0.0
    total_pct: float = 0.0
    old_price: float = 0.0
    new_price: float = 0.0


# --------------------------------------------------------------------------- #
# Aggregate market indices (FE MarketData shape)
# --------------------------------------------------------------------------- #
class SentimentContribution(BaseModel):
    agent: str
    value: float


class MarketData(BaseModel):
    """Mirrors frontend MarketData (mock_data/market.ts)."""

    assets: list[Asset] = Field(default_factory=list)
    fearGreedIndex: float = 50.0
    rumorSpeed: float = 0.0
    panicSellRatio: float = 0.0
    fomoBuyRatio: float = 0.0
    whaleBuyIntensity: float = 0.0
    whaleSellIntensity: float = 0.0
    sentimentContribution: list[SentimentContribution] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Reports & achievements
# --------------------------------------------------------------------------- #
class RoundReport(BaseModel):
    round: int
    fearGreedIndex: float
    panicSellRatio: float
    fomoBuyRatio: float
    emotion_contribution_share: float  # fraction of price move from emotion
    markdown: str = ""
    price_breakdowns: list[PriceBreakdown] = Field(default_factory=list)


class Achievement(BaseModel):
    agent_id: str
    title: str
    description: str = ""


class OverallReport(BaseModel):
    rounds: list[RoundReport] = Field(default_factory=list)
    achievements: list[Achievement] = Field(default_factory=list)
    markdown: str = ""
