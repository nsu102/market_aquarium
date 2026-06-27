"""FR-5: trade decision + execution.

Each agent trades at most ONCE per round at the exchange. The decision is
RULE-BASED and fully deterministic (no LLM, no randomness) so the same agent
state always yields the same trade. This keeps the round reproducible and the
behaviour explainable: a trade is a pure function of the agent's persona type
and its fear/greed (plus the market fear/greed index for the market-aware
personas).

Pipeline:
    decide_trade(agent, assets) -> TradeDecision   # what the agent wants to do
    execute_trade(decision, agent, assets) -> TradeResult  # clamp + apply
    run_trades(agents, assets) -> list[TradeResult]  # decide all, execute sorted

This module depends ONLY on sim.models and the stdlib.
"""

from __future__ import annotations

from .models import (
    Action,
    Agent,
    Asset,
    AgentType,
    MarketData,
    PortfolioHolding,
    TradeDecision,
    TradeResult,
)

# --------------------------------------------------------------------------- #
# Tunable, deterministic constants. Fractions are of cash (buys) or of the
# targeted holding's amount (sells).
# --------------------------------------------------------------------------- #
PANIC_SELL_FRACTION = 0.5  # panic_seller dumps half its largest holding
FOMO_BUY_FRACTION = 0.3  # fomo_trader chases with a chunk of cash
WHALE_BUY_FRACTION = 0.6  # whale buys big into fear
CONTRARIAN_BUY_FRACTION = 0.3
CONTRARIAN_SELL_FRACTION = 0.5
VALUE_BUY_FRACTION = 0.2  # value_investor nibbles on "oversold" greed
QUANT_TRADE_FRACTION = 0.3  # quant mechanical sizing (buy or sell)
CONSPIRACY_BUY_FRACTION = 0.15  # like fomo but smaller

# Emotion thresholds.
HIGH_FEAR = 60.0
HIGH_GREED = 60.0
LOW_FEAR = 40.0
EMOTION_MARGIN = 10.0  # greed/fear must beat the other by this to act

# Market fear/greed index extremes (0 = extreme fear, 100 = extreme greed).
INDEX_EXTREME_FEAR = 30.0
INDEX_EXTREME_GREED = 70.0


# --------------------------------------------------------------------------- #
# Symbol-selection helpers
# --------------------------------------------------------------------------- #
def _largest_holding(
    agent: Agent, assets_by_sym: dict[str, Asset]
) -> PortfolioHolding | None:
    """Largest (by amount) holding that is actually tradeable this round."""
    candidates = [
        h
        for h in agent.portfolio
        if h.amount > 0 and h.asset in assets_by_sym
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda h: h.amount)


def _buy_symbol(agent: Agent, assets_by_sym: dict[str, Asset]) -> str | None:
    """Pick a symbol to buy: prefer one the agent already holds, else a default."""
    for h in agent.portfolio:
        if h.asset in assets_by_sym:
            return h.asset
    if assets_by_sym:
        return next(iter(assets_by_sym))  # deterministic: first inserted key
    return None


def _buy_qty(agent: Agent, symbol: str, assets_by_sym: dict[str, Asset], fraction: float) -> float:
    """Units buyable when spending `fraction` of cash at the current price."""
    asset = assets_by_sym.get(symbol)
    if asset is None or asset.price <= 0:
        return 0.0
    spend = max(0.0, agent.cash) * fraction
    return spend / asset.price


def _fear_is_high(agent: Agent) -> bool:
    """A persona's own panic threshold takes precedence over the global one."""
    if agent.fear_threshold is not None:
        return agent.fear >= agent.fear_threshold
    return agent.fear > HIGH_FEAR


# --------------------------------------------------------------------------- #
# Decision builders
# --------------------------------------------------------------------------- #
def _hold(agent: Agent, reason: str) -> TradeDecision:
    return TradeDecision(agent_id=agent.id, action=Action.HOLD, symbol=None, qty=0.0, reason=reason)


def _buy_decision(
    agent: Agent,
    assets_by_sym: dict[str, Asset],
    fraction: float,
    action: Action,
    reason: str,
) -> TradeDecision:
    symbol = _buy_symbol(agent, assets_by_sym)
    if symbol is None:
        return _hold(agent, "no tradeable symbol to buy")
    qty = _buy_qty(agent, symbol, assets_by_sym, fraction)
    if qty <= 0:
        return _hold(agent, "insufficient cash to buy")
    return TradeDecision(agent_id=agent.id, action=action, symbol=symbol, qty=qty, reason=reason)


def _sell_decision(
    agent: Agent,
    assets_by_sym: dict[str, Asset],
    fraction: float,
    reason: str,
) -> TradeDecision:
    holding = _largest_holding(agent, assets_by_sym)
    if holding is None:
        return _hold(agent, "nothing to sell")
    qty = holding.amount * fraction
    if qty <= 0:
        return _hold(agent, "nothing to sell")
    return TradeDecision(
        agent_id=agent.id, action=Action.SELL, symbol=holding.asset, qty=qty, reason=reason
    )


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def decide_trade(
    agent: Agent,
    assets_by_sym: dict[str, Asset],
    market: MarketData | None = None,
) -> TradeDecision:
    """Rule-based, deterministic trade decision for one agent (FR-5)."""
    atype = agent.type
    index = market.fearGreedIndex if market is not None else None

    # panic_seller: dumps on high fear, otherwise sits tight.
    if atype == AgentType.PANIC_SELLER.value:
        if _fear_is_high(agent):
            return _sell_decision(
                agent, assets_by_sym, PANIC_SELL_FRACTION, "panic: fear too high, cutting losses"
            )
        return _hold(agent, "fear tolerable, holding")

    # fomo_trader: chases price when greed runs hot.
    if atype == AgentType.FOMO_TRADER.value:
        if agent.greed > HIGH_GREED:
            return _buy_decision(
                agent, assets_by_sym, FOMO_BUY_FRACTION, Action.BUY, "FOMO: greed high, buying in"
            )
        return _hold(agent, "not greedy enough yet")

    # whale: buys big into extreme fear, or when personally calm and greedy.
    if atype == AgentType.WHALE.value:
        cheap = index is not None and index < INDEX_EXTREME_FEAR
        calm_greedy = agent.fear < LOW_FEAR and agent.greed > HIGH_GREED
        if cheap or calm_greedy:
            return _buy_decision(
                agent, assets_by_sym, WHALE_BUY_FRACTION, Action.BUY_LARGE,
                "whale: accumulating into fear",
            )
        return _hold(agent, "whale waiting")

    # contrarian: fades the crowd via the market index.
    if atype == AgentType.CONTRARIAN.value:
        if index is not None and index < INDEX_EXTREME_FEAR:
            return _buy_decision(
                agent, assets_by_sym, CONTRARIAN_BUY_FRACTION, Action.BUY,
                "contrarian: buying extreme fear",
            )
        if index is not None and index > INDEX_EXTREME_GREED:
            return _sell_decision(
                agent, assets_by_sym, CONTRARIAN_SELL_FRACTION, "contrarian: selling extreme greed"
            )
        return _hold(agent, "crowd not extreme")

    # value_investor: mostly holds; nibbles on "oversold" greed; never panic sells.
    if atype == AgentType.VALUE_INVESTOR.value:
        if agent.greed - agent.fear >= EMOTION_MARGIN:
            return _buy_decision(
                agent, assets_by_sym, VALUE_BUY_FRACTION, Action.BUY,
                "value: oversold opportunity",
            )
        return _hold(agent, "value: no margin of safety, holding")

    # quant: mechanical greed-vs-fear sizing.
    if atype == AgentType.QUANT.value:
        if agent.greed - agent.fear >= EMOTION_MARGIN:
            return _buy_decision(
                agent, assets_by_sym, QUANT_TRADE_FRACTION, Action.BUY, "quant: greed signal"
            )
        if agent.fear - agent.greed >= EMOTION_MARGIN:
            return _sell_decision(
                agent, assets_by_sym, QUANT_TRADE_FRACTION, "quant: fear signal"
            )
        return _hold(agent, "quant: no signal")

    # conspiracy: follows greed like fomo, but sizes smaller.
    if atype == AgentType.CONSPIRACY.value:
        if agent.greed > HIGH_GREED:
            return _buy_decision(
                agent, assets_by_sym, CONSPIRACY_BUY_FRACTION, Action.BUY,
                "conspiracy: riding the narrative",
            )
        return _hold(agent, "conspiracy: waiting for a story")

    # news_bot (and any unknown type): never trades.
    return _hold(agent, "news_bot: observe only")


def execute_trade(
    decision: TradeDecision,
    agent: Agent,
    assets_by_sym: dict[str, Asset],
) -> TradeResult:
    """Apply a decision to the agent, clamping to cash/holdings (FR-5)."""
    action = decision.action
    symbol = decision.symbol
    asset = assets_by_sym.get(symbol) if symbol else None

    agent.lastAction = action.value

    # HOLD, or a malformed/untradeable decision: no-op.
    if action == Action.HOLD or asset is None or symbol is None:
        return TradeResult(
            agent_id=agent.id,
            action=Action.HOLD if asset is None else action,
            symbol=symbol if asset is not None else None,
            qty=0.0,
            price=asset.price if asset is not None else 0.0,
            cash_after=agent.cash,
        )

    price = asset.price

    if action in (Action.BUY, Action.BUY_LARGE):
        qty = max(0.0, decision.qty)
        # Clamp qty so the agent never spends more cash than it has.
        if price > 0 and qty * price > agent.cash:
            qty = agent.cash / price
        cost = qty * price
        agent.cash -= cost
        _merge_buy(agent, symbol, qty, price)
        return TradeResult(
            agent_id=agent.id, action=action, symbol=symbol, qty=qty, price=price,
            cash_after=agent.cash,
        )

    # SELL: clamp to the held amount; never go short.
    held = agent.holding(symbol)
    held_amount = held.amount if held is not None else 0.0
    qty = min(max(0.0, decision.qty), held_amount)
    agent.cash += qty * price
    _reduce_sell(agent, symbol, qty)
    return TradeResult(
        agent_id=agent.id, action=Action.SELL, symbol=symbol, qty=qty, price=price,
        cash_after=agent.cash,
    )


def run_trades(
    agents: list[Agent],
    assets_by_sym: dict[str, Asset],
    market: MarketData | None = None,
) -> list[TradeResult]:
    """Decide for all agents, then execute in a deterministic order (by id)."""
    decisions = {a.id: decide_trade(a, assets_by_sym, market) for a in agents}
    ordered = sorted(agents, key=lambda a: a.id)
    return [execute_trade(decisions[a.id], a, assets_by_sym) for a in ordered]


# --------------------------------------------------------------------------- #
# Portfolio mutation helpers
# --------------------------------------------------------------------------- #
def _merge_buy(agent: Agent, symbol: str, qty: float, price: float) -> None:
    """Add to (or create) a holding, recomputing the cost-weighted avgPrice."""
    if qty <= 0:
        return
    held = agent.holding(symbol)
    if held is None:
        agent.portfolio.append(PortfolioHolding(asset=symbol, amount=qty, avgPrice=price))
        return
    total_amount = held.amount + qty
    if total_amount <= 0:
        return
    held.avgPrice = (held.amount * held.avgPrice + qty * price) / total_amount
    held.amount = total_amount


def _reduce_sell(agent: Agent, symbol: str, qty: float) -> None:
    """Reduce a holding; drop it entirely once it hits zero."""
    if qty <= 0:
        return
    held = agent.holding(symbol)
    if held is None:
        return
    held.amount -= qty
    if held.amount <= 1e-9:
        agent.portfolio = [h for h in agent.portfolio if h.asset != symbol]
