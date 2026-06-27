"""FR-7: the MVP price engine.

A deliberately simple model (no real order book) whose purpose is to show how
an event and the agents' emotions distort price. The percentage change is the
sum of four components, each returned in a PriceBreakdown so the round report
can attribute the move to its causes:

    price_change_pct = event_impact + order_pressure + emotion_overheat + noise

This module depends ONLY on sim.models and the stdlib (no other sim modules).
"""

from __future__ import annotations

import random

from .models import Action, Agent, Asset, PriceBreakdown, TradeResult

# --------------------------------------------------------------------------- #
# Coefficients (module-level defaults, overridable via the `coefficients` arg).
# Keep the components in a "sane" single/low-double-digit % range.
# --------------------------------------------------------------------------- #
DEFAULT_COEFFICIENTS: dict[str, float] = {
    # event_impact_pct is already a %, so 1.0 passes it through unchanged.
    "event_scale": 1.0,
    # order_pressure: % per unit of cash-weighted net buy ratio (-1..1 -> %).
    "order_scale": 8.0,
    # BUY_LARGE moves price this many times harder than a plain BUY.
    "buy_large_weight": 2.5,
    # emotion_overheat: (mean_greed - mean_fear) is in -100..100; scale to %.
    "emotion_scale": 0.05,
    # noise: deterministic uniform in +/- this many %.
    "noise_amplitude": 0.8,
}


def _coef(coefficients: dict | None, key: str) -> float:
    """Resolve a coefficient, falling back to the module default."""
    if coefficients and key in coefficients:
        return float(coefficients[key])
    return float(DEFAULT_COEFFICIENTS[key])


def _order_pressure(
    symbol: str | None,
    agents: list[Agent],
    trades: list[TradeResult],
    coefficients: dict | None,
) -> float:
    """Cash-weighted net buy/sell pressure for `symbol`, mapped to a %.

    Bigger wallets move price more, so each trade is weighted by the trading
    agent's cash. BUY_LARGE counts heavier than BUY. The signed weight is
    normalised by the total participating weight so the result stays in a
    bounded range before scaling.
    """
    if not symbol:
        return 0.0

    cash_by_agent = {a.id: max(0.0, a.cash) for a in agents}
    buy_large_w = _coef(coefficients, "buy_large_weight")

    signed = 0.0
    magnitude = 0.0
    for t in trades:
        if t.symbol != symbol:
            continue
        cash = cash_by_agent.get(t.agent_id, 0.0)
        if cash <= 0:
            continue
        if t.action == Action.BUY:
            w = cash
        elif t.action == Action.BUY_LARGE:
            w = cash * buy_large_w
        elif t.action == Action.SELL:
            w = -cash
        else:  # HOLD or anything else exerts no pressure
            continue
        signed += w
        magnitude += abs(w)

    if magnitude <= 0:
        return 0.0

    net_ratio = signed / magnitude  # in [-1, 1]
    return net_ratio * _coef(coefficients, "order_scale")


def _emotion_overheat(agents: list[Agent], coefficients: dict | None) -> float:
    """Aggregate greed-vs-fear pressure. Greed pushes up, fear pushes down."""
    if not agents:
        return 0.0
    mean_greed = sum(a.greed for a in agents) / len(agents)
    mean_fear = sum(a.fear for a in agents) / len(agents)
    return (mean_greed - mean_fear) * _coef(coefficients, "emotion_scale")


def _noise(seed: int, coefficients: dict | None) -> float:
    """Deterministic noise: same seed => same value."""
    rng = random.Random(seed)
    amp = _coef(coefficients, "noise_amplitude")
    return rng.uniform(-amp, amp)


def compute_price_change(
    asset: Asset,
    event_impact_pct: float,
    agents: list[Agent],
    trades: list[TradeResult],
    seed: int,
    coefficients: dict | None = None,
) -> PriceBreakdown:
    """Compute the four-component price change for a single asset (FR-7).

    Returns a PriceBreakdown; it does not mutate the asset (see apply_breakdown).
    """
    event_impact = event_impact_pct * _coef(coefficients, "event_scale")
    order_pressure = _order_pressure(asset.symbol, agents, trades, coefficients)
    emotion_overheat = _emotion_overheat(agents, coefficients)
    noise = _noise(seed, coefficients)

    total_pct = event_impact + order_pressure + emotion_overheat + noise

    old_price = asset.price
    new_price = old_price * (1 + total_pct / 100.0)
    new_price = max(0.0, round(new_price, 4))  # price never goes negative

    return PriceBreakdown(
        symbol=asset.symbol,
        event_impact=event_impact,
        order_pressure=order_pressure,
        emotion_overheat=emotion_overheat,
        noise=noise,
        total_pct=total_pct,
        old_price=old_price,
        new_price=new_price,
    )


def apply_breakdown(asset: Asset, b: PriceBreakdown) -> None:
    """Mutate `asset` in place with the computed breakdown."""
    asset.price = b.new_price
    asset.priceHistory.append(b.new_price)
    asset.change24h = b.total_pct


def apply_breakdowns(assets: list[Asset], breakdowns: list[PriceBreakdown]) -> None:
    """Apply each breakdown to its matching asset (by symbol)."""
    by_symbol = {a.symbol: a for a in assets}
    for b in breakdowns:
        asset = by_symbol.get(b.symbol)
        if asset is not None:
            apply_breakdown(asset, b)
