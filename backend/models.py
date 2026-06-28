from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


# ── Request models ──

class PortfolioItem(BaseModel):
    asset: str
    amount: float
    avgPrice: float


class AgentCreate(BaseModel):
    id: str
    alias: str
    type: str
    sprite: str = ""
    cash: float
    portfolio: list[PortfolioItem] = []
    fear: int = 50
    greed: int = 50
    color: str = "#888"


class AssetCreate(BaseModel):
    symbol: str
    name: str
    price: float


class GameCreateRequest(BaseModel):
    agents: list[AgentCreate]
    assets: list[AssetCreate]


class EventRequest(BaseModel):
    text: str


class RoundNextRequest(BaseModel):
    event: Optional[str] = None


# ── Internal state models ──

class AgentState(BaseModel):
    id: str
    alias: str
    type: str
    sprite: str = ""
    cash: float
    portfolio: list[PortfolioItem] = []
    fear: int = 50
    greed: int = 50
    lastAction: str = "대기"
    location: str = "home"
    bubble: str = ""
    color: str = "#888"
    importanceSum: float = 0
    dailyPlan: list[str] = []


class AssetState(BaseModel):
    symbol: str
    name: str
    price: float
    change24h: float = 0
    volume: float = 0
    priceHistory: list[float] = []


class MarketState(BaseModel):
    assets: list[AssetState] = []
    fearGreedIndex: int = 50
    rumorSpeed: float = 0
    panicSellRatio: float = 0
    fomoBuyRatio: float = 0
    whaleBuyIntensity: float = 0
    whaleSellIntensity: float = 0
    sentimentContribution: list[dict] = []


class EventState(BaseModel):
    id: str
    round: int
    text: str
    source: str  # "user" | "system"
    impact: str  # "positive" | "negative" | "neutral"
    timestamp: str = ""


class Comment(BaseModel):
    agentId: str
    agentAlias: str
    content: str


class PostState(BaseModel):
    id: str
    agentId: str
    agentAlias: str
    content: str
    asset: Optional[str] = None
    likes: int = 0
    comments: list[Comment] = []
    timestamp: str = ""
    round: int = 0


class ReportState(BaseModel):
    round: int
    markdown: str


# ── LLM response schema ──

class LLMAction(BaseModel):
    type: str = "HOLD"  # BUY|SELL|HOLD|BUY_LARGE|SELL_LARGE
    asset: Optional[str] = None
    amount: float = 0
    reason: str = ""


class LLMPost(BaseModel):
    write: bool = False
    content: Optional[str] = None
    asset: Optional[str] = None


class LLMComment(BaseModel):
    write: bool = False
    targetPostId: Optional[str] = None
    content: Optional[str] = None


class LLMAgentResponse(BaseModel):
    poignancy: int = 5
    fearDelta: int = 0
    greedDelta: int = 0
    action: LLMAction = Field(default_factory=LLMAction)
    post: LLMPost = Field(default_factory=LLMPost)
    comment: LLMComment = Field(default_factory=LLMComment)
    location: str = "home"
    bubble: str = ""


class GameState(BaseModel):
    gameId: str
    round: int = 1
    agents: list[AgentState] = []
    market: MarketState = Field(default_factory=MarketState)
    events: list[EventState] = []
    posts: list[PostState] = []
    reports: list[ReportState] = []
