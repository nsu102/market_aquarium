"""FR-8: aggregate the agent population + this round's trades into MarketData.

This module turns the runtime agent population and the trades produced this
round into the dashboard indices the frontend MarketPanel renders (the FE
MarketData shape). Everything here is deterministic -- no LLM, no randomness --
so the same inputs always yield the same indices.

This module depends ONLY on sim.models and the stdlib (no other sim modules).
"""

from __future__ import annotations

from .models import (
    Action,
    Agent,
    Asset,
    AgentType,
    MarketData,
    SentimentContribution,
    TradeResult,
)

# Whale agents are identified by their type string (Agent.type is a plain str).
_WHALE = AgentType.WHALE.value

# Actions that count as "buying" for FOMO / whale-buy aggregation.
_BUY_ACTIONS = (Action.BUY, Action.BUY_LARGE)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _mean(values: list[float]) -> float:
    """Arithmetic mean, 0.0 for an empty list (no div-by-zero)."""
    return sum(values) / len(values) if values else 0.0


def _fear_greed_index(agents: list[Agent]) -> float:
    """Market fear/greed index in [0, 100], higher = greedier.

    Definition: clamp(50 + mean(greed) - mean(fear), 0, 100). A perfectly
    balanced population (mean greed == mean fear) sits at the neutral 50;
    an all-greedy population saturates at 100, an all-fearful one at 0.
    """
    if not agents:
        return 50.0  # neutral default when there is no population yet
    mean_greed = _mean([a.greed for a in agents])
    mean_fear = _mean([a.fear for a in agents])
    return _clamp(50.0 + mean_greed - mean_fear, 0.0, 100.0)


def _action_ratio(
    agents: list[Agent],
    trades: list[TradeResult],
    actions: tuple[Action, ...],
) -> float:
    """Fraction of agents who took any of `actions` this round, in [0, 1].

    Counted per distinct agent (not per trade) so the ratio can never exceed
    1.0 even if an agent somehow trades more than once.
    """
    if not agents:
        return 0.0
    matched = {t.agent_id for t in trades if t.action in actions}
    return len(matched) / len(agents)


def _whale_intensity(
    agents: list[Agent],
    trades: list[TradeResult],
    actions: tuple[Action, ...],
) -> float:
    """Whale share of notional for `actions`, normalized to [0, 1].

    notional = qty * price. Returns (whale notional) / (total notional) across
    all agents for those actions, or 0.0 when nobody traded in that direction.
    """
    type_by_agent = {a.id: a.type for a in agents}
    whale_notional = 0.0
    total_notional = 0.0
    for t in trades:
        if t.action not in actions:
            continue
        notional = abs(t.qty) * abs(t.price)
        if notional <= 0:
            continue
        total_notional += notional
        if type_by_agent.get(t.agent_id) == _WHALE:
            whale_notional += notional
    if total_notional <= 0:
        return 0.0
    return _clamp(whale_notional / total_notional, 0.0, 1.0)


def _rumor_speed(posts_count: int, agents: list[Agent]) -> float:
    """Rumor diffusion proxy in [0, 1].

    Posts per agent, capped at 1.0: when the board sees roughly one post per
    agent the rumor is considered to be spreading at full speed.
    """
    denom = len(agents) or 1
    return _clamp(posts_count / denom, 0.0, 1.0)


def _sentiment_contribution(agents: list[Agent]) -> list[SentimentContribution]:
    """Per-agent net sentiment, one entry per agent.

    value = (greed - fear) / 100, in [-1, 1]: positive means the agent leans
    greedy (pushing price up), negative means fearful (pushing price down).
    """
    out: list[SentimentContribution] = []
    for a in agents:
        value = _clamp((a.greed - a.fear) / 100.0, -1.0, 1.0)
        out.append(SentimentContribution(agent=a.alias, value=value))
    return out


def compute_market_data(
    agents: list[Agent],
    assets: list[Asset],
    trades: list[TradeResult] | None = None,
    posts_count: int = 0,
    prev: MarketData | None = None,
) -> MarketData:
    """Aggregate the population + this round's trades into MarketData.

    Args:
        agents: runtime agent population.
        assets: current assets, passed through verbatim into the result.
        trades: trades executed this round (None == no trades).
        posts_count: number of board posts this round (rumor-speed proxy).
        prev: previous MarketData; accepted for a stable signature / future
            smoothing. Currently unused -- indices are computed fresh each round.

    Returns:
        A fully populated MarketData. All ratios are in [0, 1], the fear/greed
        index is in [0, 100], and sentiment values are in [-1, 1]. Empty inputs
        return sane neutral defaults rather than raising.
    """
    trades = trades or []

    return MarketData(
        assets=assets,
        fearGreedIndex=_fear_greed_index(agents),
        rumorSpeed=_rumor_speed(posts_count, agents),
        panicSellRatio=_action_ratio(agents, trades, (Action.SELL,)),
        fomoBuyRatio=_action_ratio(agents, trades, _BUY_ACTIONS),
        whaleBuyIntensity=_whale_intensity(agents, trades, _BUY_ACTIONS),
        whaleSellIntensity=_whale_intensity(agents, trades, (Action.SELL,)),
        sentimentContribution=_sentiment_contribution(agents),
    )
