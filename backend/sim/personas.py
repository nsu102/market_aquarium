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

# Pre-computed allocations (cash% + per-asset%) baked in JSON — deterministic,
# never user-selected (per product decision). See portfolio_allocations.json.
_ALLOC_PATH = Path(__file__).resolve().parent / "portfolio_allocations.json"
try:
    _ALLOCATIONS: dict = {
        k: v for k, v in json.loads(_ALLOC_PATH.read_text(encoding="utf-8")).items()
        if not k.startswith("_")
    }
except Exception:
    _ALLOCATIONS = {}

# Default starting cash candidate pools (KRW), aligned with FE defaultCash.
PERSONA_POOL: list[Persona] = [
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
        herd_sensitivity=0.5,
        rumor_sensitivity=0.95,
    ),
]

# The MVP default 6 (PRD §0 #9) -- matches the frontend's 6 default profiles.
DEFAULT_PERSONA_IDS = ["panic", "fomo", "value", "quant", "whale", "contrarian"]

_POOL_BY_ID = {p.persona_id: p for p in PERSONA_POOL}


def get_persona(persona_id: str) -> Persona:
    return _POOL_BY_ID[persona_id]


def _precomputed_portfolio(
    persona: Persona, prices: dict[str, float]
) -> tuple[float, list[PortfolioHolding]]:
    """Deterministically split the persona's set capital into cash + holdings
    using the baked allocation (cash% + per-asset%). No randomness."""
    spec = _ALLOCATIONS.get(persona.persona_id)
    if not spec:
        # Fallback: keep all as cash from the pool's middle value.
        mid = persona.cash_pool[len(persona.cash_pool) // 2] if persona.cash_pool else 5_000_000
        return float(mid), []
    total = float(spec.get("total", 0))
    cash = total * float(spec.get("cash_pct", 0)) / 100.0
    holdings: list[PortfolioHolding] = []
    for sym, pct in (spec.get("alloc") or {}).items():
        price = prices.get(sym)
        if not price or price <= 0:
            cash += total * float(pct) / 100.0  # asset unavailable -> keep as cash
            continue
        invest = total * float(pct) / 100.0
        amount = round(invest / price, 6)
        if amount > 0:
            holdings.append(PortfolioHolding(asset=sym, amount=amount, avgPrice=price))
    return cash, holdings


def build_agent(persona: Persona, prices: dict[str, float], rng: random.Random) -> Agent:
    # rng kept in the signature for API compatibility; portfolio is now
    # deterministic (pre-computed allocation), not sampled.
    cash, portfolio = _precomputed_portfolio(persona, prices)
    return Agent(
        id=persona.persona_id,
        alias=persona.alias,
        type=persona.type.value,
        sprite=persona.sprite,
        cash=cash,
        portfolio=portfolio,
        fear=persona.default_fear,
        greed=persona.default_greed,
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
    return [build_agent(_POOL_BY_ID[pid], prices, rng) for pid in persona_ids]
