"""The persona pool and seeded sampling into runtime Agents.

Personality lives entirely in scratch text fields (PRD §3.1) so the LLM
generates the right tone for free. ids/aliases/colors/sprites are kept aligned
with frontend/constants/agentProfiles.ts so the UI and backend agree.

cash and portfolio are sampled (seeded, deterministic) from per-persona candidate
pools -- never LLM-generated (PRD: time/cost).
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from .assets import assets_by_symbol, load_assets
from .models import Action, Agent, AgentType, Location, Persona, PortfolioHolding, Position

# Pre-computed allocations: try MongoDB first, fallback to JSON file.
_ALLOC_PATH = Path(__file__).resolve().parent / "portfolio_allocations.json"


def _load_allocations() -> dict:
    from backend.db import _db
    docs = list(_db().allocations.find())
    if not docs:
        # ponytail: allow seed to run without pre-existing allocations
        return {}
    result = {}
    for d in docs:
        pid = d["_id"]
        # New format: {"_id": ..., "presets": [...]}
        # Legacy format: {"_id": ..., "total": ..., "cash_pct": ..., "alloc": ...}
        if "presets" in d:
            result[pid] = d["presets"]
        else:
            result[pid] = {k: v for k, v in d.items() if k != "_id"}
    return result


_ALLOCATIONS: dict = _load_allocations()


def get_all_presets() -> dict[str, list[dict]]:
    """Return raw presets per persona for the /control/presets endpoint."""
    return _ALLOCATIONS

def _load_personas_from_db() -> list[Persona]:
    from backend.db import _db
    docs = list(_db().personas.find())
    if not docs:
        # ponytail: fallback to hardcoded pool when DB is empty (e.g. during seed)
        return list(_HARDCODED_POOL)
    return [Persona(**{k: v for k, v in d.items() if k != "_id"}) for d in docs]


# Default starting cash candidate pools (KRW), aligned with FE defaultCash.
_HARDCODED_POOL: list[Persona] = [
    Persona(
        persona_id="panic",
        alias="패닉셀 개미",
        type=AgentType.PANIC_SELLER,
        sprite="/assets/characters/Jane_Moreno.png",
        color="#C85A4A",
        innate="impulsive, fear-driven, easily panics, follows the crowd",
        learned="a retail investor burned in past crashes; checks the board obsessively",
        currently="anxious about a possible downturn, ready to cut losses fast",
        lifestyle="watches price charts all day, sleeps poorly",
        daily_req="monitor the board for bad news and react quickly by selling",
        cash_pool=[3_000_000, 5_000_000, 7_000_000],
        portfolio_symbol_pool=["BTC", "ETH", "DOGE", "SHIB", "XRP"],
        default_fear=85,
        default_greed=15,
        default_confidence=25,
        default_excitement=72,
        default_trust=35,
        herd_sensitivity=0.9,
        rumor_sensitivity=0.8,
        fear_threshold=70,
    ),
    Persona(
        persona_id="fomo",
        alias="FOMO 단타러",
        type=AgentType.FOMO_TRADER,
        sprite="/assets/characters/Eddy_Lin.png",
        color="#D4A843",
        innate="greedy, short-term, trend-chasing, hates missing out",
        learned="made quick money once and now chases every pump",
        currently="scanning for the next breakout to jump into",
        lifestyle="day-trades on a phone, reacts to hype instantly",
        daily_req="find rising momentum and buy in before it is too late",
        cash_pool=[3_000_000, 5_000_000, 8_000_000],
        portfolio_symbol_pool=["SOL", "PEPE", "WIF", "BONK", "DOGE"],
        default_fear=20,
        default_greed=90,
        default_confidence=72,
        default_excitement=85,
        default_trust=45,
        herd_sensitivity=0.85,
        rumor_sensitivity=0.6,
    ),
    Persona(
        persona_id="value",
        alias="가치투자자",
        type=AgentType.VALUE_INVESTOR,
        sprite="/assets/characters/Klaus_Mueller.png",
        color="#5B8FB9",
        innate="calm, analytical, skeptical, long-term oriented",
        learned="studies fundamentals; distrusts rumors and hype",
        currently="looking for oversold quality assets, ignoring noise",
        lifestyle="reads reports, trades rarely and deliberately",
        daily_req="verify news credibility first, only act on solid information",
        cash_pool=[30_000_000, 50_000_000, 70_000_000],
        portfolio_symbol_pool=["BTC", "ETH", "LINK", "DOT", "ATOM"],
        default_fear=30,
        default_greed=40,
        default_confidence=72,
        default_excitement=24,
        default_trust=72,
        herd_sensitivity=0.2,
        rumor_sensitivity=0.2,
    ),
    Persona(
        persona_id="quant",
        alias="퀀트 트레이더",
        type=AgentType.QUANT,
        sprite="/assets/characters/Rajiv_Patel.png",
        color="#8B6DB0",
        innate="systematic, data-driven, unemotional",
        learned="trusts technical indicators and statistics over narratives",
        currently="watching volatility and panic-sell ratios for signals",
        lifestyle="runs models, executes mechanically",
        daily_req="trade on quantitative signals, not on sentiment",
        cash_pool=[15_000_000, 20_000_000, 30_000_000],
        portfolio_symbol_pool=["BTC", "ETH", "SOL", "ARB", "OP"],
        default_fear=45,
        default_greed=55,
        default_confidence=75,
        default_excitement=20,
        default_trust=66,
        herd_sensitivity=0.3,
        rumor_sensitivity=0.3,
    ),
    Persona(
        persona_id="whale",
        alias="매크로 고래",
        type=AgentType.WHALE,
        sprite="/assets/characters/Arthur_Burton.png",
        color="#5B8C3E",
        innate="patient, contrarian at scale, exploits crowd fear",
        learned="thinks in macro cycles; accumulates when others panic",
        currently="waiting for a fear spike to buy large and quietly",
        lifestyle="moves big size, ignores daily noise",
        daily_req="buy large when fear is extreme, sell into euphoria",
        cash_pool=[300_000_000, 500_000_000, 800_000_000],
        portfolio_symbol_pool=["BTC", "ETH", "SOL", "XRP", "LINK"],
        default_fear=10,
        default_greed=70,
        default_confidence=86,
        default_excitement=20,
        default_trust=70,
        herd_sensitivity=0.1,
        rumor_sensitivity=0.2,
    ),
    Persona(
        persona_id="contrarian",
        alias="역발상 투자자",
        type=AgentType.CONTRARIAN,
        sprite="/assets/characters/Wolfgang_Schulz.png",
        color="#5BA88C",
        innate="independent, counter-trend, distrusts consensus",
        learned="buys fear, sells greed; comfortable being alone",
        currently="watching the crowd to do the opposite",
        lifestyle="trades against the prevailing mood",
        daily_req="fade the crowd -- buy when others fear, sell when others are greedy",
        cash_pool=[10_000_000, 15_000_000, 25_000_000],
        portfolio_symbol_pool=["BTC", "ETH", "AAVE", "UNI", "MKR"],
        default_fear=25,
        default_greed=60,
        default_confidence=70,
        default_excitement=46,
        default_trust=30,
        herd_sensitivity=0.05,
        rumor_sensitivity=0.3,
    ),
    Persona(
        persona_id="news_bot",
        alias="뉴스 요약 봇",
        type=AgentType.NEWS_BOT,
        sprite="/assets/characters/Isabella_Rodriguez.png",
        color="#5A7BC8",
        innate="neutral, factual, fast, summarizing",
        learned="distills events into concise headlines without opinion",
        currently="relaying the latest event to the board",
        lifestyle="posts summaries, rarely trades",
        daily_req="summarize the event for the community without bias",
        cash_pool=[1_000_000, 2_000_000],
        portfolio_symbol_pool=["BTC", "ETH"],
        default_fear=50,
        default_greed=50,
        default_confidence=50,
        default_excitement=28,
        default_trust=80,
        herd_sensitivity=0.0,
        rumor_sensitivity=0.1,
    ),
    Persona(
        persona_id="conspiracy",
        alias="음모론 인플루언서",
        type=AgentType.CONSPIRACY,
        sprite="/assets/characters/Tom_Moreno.png",
        color="#B85A6A",
        innate="provocative, attention-seeking, narrative-spinning",
        learned="turns uncertainty into dramatic stories that spread",
        currently="hunting for an unclear event to sensationalize",
        lifestyle="posts inflammatory takes, feeds on engagement",
        daily_req="find uncertain news and post a sensational interpretation",
        cash_pool=[2_000_000, 4_000_000, 6_000_000],
        portfolio_symbol_pool=["DOGE", "SHIB", "PEPE", "BONK"],
        default_fear=40,
        default_greed=65,
        default_confidence=64,
        default_excitement=82,
        default_trust=12,
        herd_sensitivity=0.5,
        rumor_sensitivity=0.95,
    ),
    Persona(
        persona_id="player",
        alias="플레이어",
        type=AgentType.VALUE_INVESTOR,  # neutral default type
        sprite="/assets/characters/Sam_Moore.png",
        color="#E8A43A",
        innate="adaptable, player-controlled, follows the player's strategy each round",
        learned="takes direction from the player before each round",
        currently="waiting for the player's strategy instructions",
        lifestyle="adjusts approach based on player input each round",
        daily_req="follow the player's strategy and emotion settings",
        cash_pool=[10_000_000, 20_000_000, 50_000_000],
        portfolio_symbol_pool=["BTC", "ETH", "SOL", "XRP", "LINK"],
        default_fear=50,
        default_greed=50,
        default_confidence=50,
        default_excitement=50,
        default_trust=50,
        herd_sensitivity=0.3,
        rumor_sensitivity=0.3,
    ),
]

PERSONA_POOL: list[Persona] = _load_personas_from_db()

# The MVP default 6 (PRD §0 #9) -- matches the frontend's 6 default profiles.
DEFAULT_PERSONA_IDS = ["panic", "fomo", "value", "quant", "contrarian", "player"]

# --------------------------------------------------------------------------- #
# SNS-only crowd (D2): extra characters that live ONLY on the board. They never
# appear on the map, never trade, never move price. Each round they MUST write a
# post/comment and cast like/dislike votes -- they are the "관중" that makes the
# feed feel alive. Types are reused from AgentType only to flavour their tone.
# --------------------------------------------------------------------------- #
def _sns(persona_id, alias, type_, color, innate, currently,
         fear=50, greed=50, confidence=50, excitement=50, trust=50) -> Persona:
    return Persona(
        persona_id=persona_id, alias=alias, type=type_,
        sprite="", color=color,
        innate=innate, learned="lurks the board all day, never trades",
        currently=currently, lifestyle="comments and reacts, never trades",
        daily_req="react to the feed with one punchy post/comment and vote",
        cash_pool=[0], portfolio_symbol_pool=[],
        default_fear=fear, default_greed=greed,
        default_confidence=confidence, default_excitement=excitement, default_trust=trust,
    )


SNS_PERSONA_POOL: list[Persona] = [
    _sns("sns_ant", "불장기원 개미", AgentType.FOMO_TRADER, "#E0843F",
         "hopeful retail, hypes every green candle", "praying for a pump",
         fear=35, greed=80, confidence=55, excitement=82, trust=50),
    _sns("sns_troll", "주식방 악플러", AgentType.CONSPIRACY, "#C0506A",
         "provocative troll, loves to dunk on bad calls", "looking for someone to mock",
         fear=30, greed=55, confidence=80, excitement=75, trust=15),
    _sns("sns_newbie", "코린이 뉴비", AgentType.FOMO_TRADER, "#E6B84A",
         "anxious beginner, asks naive questions", "confused and scared of missing out",
         fear=70, greed=55, confidence=20, excitement=70, trust=60),
    _sns("sns_guru", "익명 고수", AgentType.VALUE_INVESTOR, "#4F86C6",
         "smug veteran, drops one-liners", "judging everyone's moves",
         fear=25, greed=45, confidence=88, excitement=25, trust=60),
    _sns("sns_cheer", "치어리더", AgentType.FOMO_TRADER, "#5BB05B",
         "relentless optimist, cheers any holder", "hyping the room up",
         fear=15, greed=70, confidence=80, excitement=90, trust=65),
    _sns("sns_doomer", "공포팔이", AgentType.PANIC_SELLER, "#B5564A",
         "doom-poster, sees a crash everywhere", "spreading dread",
         fear=90, greed=20, confidence=30, excitement=78, trust=25),
    _sns("sns_quantfan", "지표충", AgentType.QUANT, "#8B6DB0",
         "posts RSI/MACD takes, acts technical", "reading the charts out loud",
         fear=45, greed=55, confidence=72, excitement=22, trust=68),
    _sns("sns_contra", "청개구리", AgentType.CONTRARIAN, "#5BA88C",
         "contrarian gadfly, fades the room", "doing the opposite of the crowd",
         fear=30, greed=55, confidence=70, excitement=45, trust=28),
]

_POOL_BY_ID = {p.persona_id: p for p in PERSONA_POOL}
# Ensure hardcoded personas (e.g. player) are always available even if not in MongoDB
for _hp in _HARDCODED_POOL:
    if _hp.persona_id not in _POOL_BY_ID:
        _POOL_BY_ID[_hp.persona_id] = _hp
_SNS_BY_ID = {p.persona_id: p for p in SNS_PERSONA_POOL}


def get_persona(persona_id: str) -> Persona:
    return _POOL_BY_ID[persona_id]


def _apply_spec(
    spec: dict, prices: dict[str, float]
) -> tuple[float, list[PortfolioHolding]]:
    """Turn a single allocation spec {total, cash_pct, alloc} into (cash, holdings)."""
    total = float(spec.get("total", 0))
    cash = total * float(spec.get("cash_pct", 0)) / 100.0
    holdings: list[PortfolioHolding] = []
    for sym, pct in (spec.get("alloc") or {}).items():
        price = prices.get(sym)
        if not price or price <= 0:
            cash += total * float(pct) / 100.0
            continue
        invest = total * float(pct) / 100.0
        amount = round(invest / price, 6)
        if amount > 0:
            holdings.append(PortfolioHolding(asset=sym, amount=amount, avgPrice=price))
    return cash, holdings


def _precomputed_portfolio(
    persona: Persona, prices: dict[str, float], preset_index: int = 0,
) -> tuple[float, list[PortfolioHolding]]:
    """Deterministically split the persona's set capital into cash + holdings
    using the baked allocation (cash% + per-asset%). No randomness."""
    raw = _ALLOCATIONS.get(persona.persona_id)
    if not raw:
        mid = persona.cash_pool[len(persona.cash_pool) // 2] if persona.cash_pool else 5_000_000
        return float(mid), []
    # ponytail: support both old dict and new list[dict] format
    if isinstance(raw, list):
        spec = raw[preset_index % len(raw)]
    else:
        spec = raw
    return _apply_spec(spec, prices)


def build_agent(persona: Persona, prices: dict[str, float], rng: random.Random,
                preset_index: int = 0) -> Agent:
    # rng kept in the signature for API compatibility; portfolio is now
    # deterministic (pre-computed allocation), not sampled.
    cash, portfolio = _precomputed_portfolio(persona, prices, preset_index)
    return Agent(
        id=persona.persona_id,
        alias=persona.alias,
        type=persona.type.value,
        sprite=persona.sprite,
        cash=cash,
        portfolio=portfolio,
        fear=persona.default_fear,
        greed=persona.default_greed,
        confidence=persona.default_confidence,
        excitement=persona.default_excitement,
        trust=persona.default_trust,
        lastAction=Action.HOLD.value,
        location=Location.HOME,
        position=Position(),
        bubble="",
        color=persona.color,
        innate=persona.innate,
        learned=persona.learned,
        currently=persona.currently,
        lifestyle=persona.lifestyle,
        daily_req=persona.daily_req,
        herd_sensitivity=persona.herd_sensitivity,
        rumor_sensitivity=persona.rumor_sensitivity,
        fear_threshold=persona.fear_threshold,
    )


def sample_agents(
    n: int = 6,
    seed: int = 42,
    persona_ids: list[str] | None = None,
    prices: dict[str, float] | None = None,
    preset_indices: dict[str, int] | None = None,
) -> list[Agent]:
    """Deterministically build n runtime agents from the pool (PRD §2.3)."""
    rng = random.Random(seed)
    if prices is None:
        prices = {a.symbol: a.price for a in load_assets()}
    if persona_ids is None:
        if n <= len(DEFAULT_PERSONA_IDS):
            persona_ids = DEFAULT_PERSONA_IDS[:n]
        else:
            extra = [p.persona_id for p in PERSONA_POOL if p.persona_id not in DEFAULT_PERSONA_IDS]
            persona_ids = (DEFAULT_PERSONA_IDS + extra)[:n]
    pi = preset_indices or {}
    return [build_agent(_POOL_BY_ID[pid], prices, rng, pi.get(pid, 0)) for pid in persona_ids]


def build_sns_agent(persona: Persona) -> Agent:
    """A board-only spectator: no portfolio, no map presence, never trades."""
    return Agent(
        id=persona.persona_id,
        alias=persona.alias,
        type=persona.type.value,
        sprite=persona.sprite,
        cash=0.0,
        portfolio=[],
        fear=persona.default_fear,
        greed=persona.default_greed,
        confidence=persona.default_confidence,
        excitement=persona.default_excitement,
        trust=persona.default_trust,
        lastAction=Action.HOLD.value,
        location=Location.COMMUNITY,
        position=Position(),
        color=persona.color,
        innate=persona.innate,
        learned=persona.learned,
        currently=persona.currently,
        lifestyle=persona.lifestyle,
        daily_req=persona.daily_req,
        sns_only=True,
    )


def sample_sns_agents(n: int = 6) -> list[Agent]:
    """The first ``n`` SNS-only spectators (D2: as many as the playing agents)."""
    pool = SNS_PERSONA_POOL[: max(0, n)]
    return [build_sns_agent(p) for p in pool]
