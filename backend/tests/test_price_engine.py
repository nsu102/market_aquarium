"""Tests for the FR-7 price engine (sim/price_engine.py)."""

from __future__ import annotations

import math

from sim.models import Action, Agent, Asset, TradeResult
from sim.price_engine import (
    apply_breakdown,
    apply_breakdowns,
    compute_price_change,
)


def _asset(
    symbol: str = "BTC",
    price: float = 100.0,
    *,
    sector: str = "",
    volume: float = 0.0,
    history: list[float] | None = None,
) -> Asset:
    return Asset(
        symbol=symbol,
        name=symbol,
        price=price,
        sector=sector,
        volume=volume,
        priceHistory=history or [price],
    )


def _agent(
    agent_id: str,
    cash: float = 1000.0,
    fear: float = 50.0,
    greed: float = 50.0,
) -> Agent:
    return Agent(id=agent_id, alias=agent_id, type="quant", sprite="s", cash=cash,
                 fear=fear, greed=greed)


def _sell(
    agent_id: str,
    symbol: str = "BTC",
    *,
    qty: float = 0.0,
    price: float = 0.0,
) -> TradeResult:
    return TradeResult(agent_id=agent_id, action=Action.SELL, symbol=symbol, qty=qty, price=price)


def _buy(
    agent_id: str,
    symbol: str = "BTC",
    large: bool = False,
    *,
    qty: float = 0.0,
    price: float = 0.0,
) -> TradeResult:
    return TradeResult(
        agent_id=agent_id,
        action=Action.BUY_LARGE if large else Action.BUY,
        symbol=symbol,
        qty=qty,
        price=price,
    )


def test_price_is_sum_of_components():
    asset = _asset()
    agents = [_agent("a", greed=70, fear=30), _agent("b", greed=40, fear=60)]
    trades = [_buy("a"), _sell("b")]
    b = compute_price_change(asset, 2.0, agents, trades, seed=123)
    expected = b.event_impact + b.order_pressure + b.emotion_overheat + b.noise
    assert math.isclose(b.total_pct, expected, rel_tol=1e-9, abs_tol=1e-9)


def test_panic_selling_pushes_down():
    asset = _asset(price=100.0)
    # cash-heavy agents all selling
    agents = [_agent("a", cash=10_000), _agent("b", cash=8_000)]
    trades = [_sell("a"), _sell("b")]
    # neutral emotion + pass zero event so the order pressure dominates
    b = compute_price_change(asset, 0.0, agents, trades, seed=1)
    assert b.order_pressure < 0
    assert b.new_price < b.old_price


def test_emotion_overheat_contributes():
    asset = _asset()
    greedy = [_agent("a", greed=90, fear=10), _agent("b", greed=85, fear=15)]
    fearful = [_agent("a", greed=10, fear=90), _agent("b", greed=15, fear=85)]

    pos = compute_price_change(asset, 0.0, greedy, [], seed=5)
    neg = compute_price_change(asset, 0.0, fearful, [], seed=5)
    assert pos.emotion_overheat > 0
    assert neg.emotion_overheat < 0


def test_noise_deterministic_under_seed():
    asset = _asset()
    agents = [_agent("a")]
    same_a = compute_price_change(asset, 1.0, agents, [], seed=42)
    same_b = compute_price_change(asset, 1.0, agents, [], seed=42)
    diff = compute_price_change(asset, 1.0, agents, [], seed=99)
    assert same_a.noise == same_b.noise
    assert same_a.noise != diff.noise  # different seed -> (usually) different


def test_report_exposes_breakdown():
    asset = _asset(price=250.0)
    agents = [_agent("a", greed=60, fear=40)]
    trades = [_buy("a")]
    b = compute_price_change(asset, 1.5, agents, trades, seed=7)
    # all four components + old/new are present and typed
    for attr in ("event_impact", "order_pressure", "emotion_overheat", "noise",
                 "total_pct", "old_price", "new_price"):
        assert isinstance(getattr(b, attr), float)
    assert b.symbol == "BTC"
    assert b.old_price == 250.0


def test_extreme_event_is_capped_and_price_never_negative():
    asset = _asset(price=100.0)
    agents = [_agent("a", cash=10_000, fear=100, greed=0)]
    trades = [_sell("a")]
    b = compute_price_change(asset, -9999.0, agents, trades, seed=3)
    assert -30.0 < b.total_pct < 0.0
    assert b.new_price >= 0


def test_event_sensitivity_differs_by_asset_profile():
    btc = _asset("BTC", sector="L1_major", volume=90_000_000_000)
    pepe = _asset("PEPE", sector="meme", volume=3_000_000_000)
    agents = [_agent("a")]
    b_btc = compute_price_change(
        btc,
        2.0,
        agents,
        [],
        seed=10,
        coefficients={"noise_amplitude": 0.0},
    )
    b_pepe = compute_price_change(
        pepe,
        2.0,
        agents,
        [],
        seed=10,
        coefficients={"noise_amplitude": 0.0},
    )
    assert b_pepe.event_impact > b_btc.event_impact
    assert b_pepe.total_pct > b_btc.total_pct


def test_direct_asset_event_amplifies_targeted_symbol():
    sol = _asset("SOL", sector="L1_major", volume=40_000_000_000)
    agents = [_agent("a")]
    coeffs = {
        "noise_amplitude": 0.0,
        "emotion_scale": 0.0,
        "order_scale": 0.0,
        "event_dispersion": 0.0,
    }

    targeted = compute_price_change(
        sol,
        -3.0,
        agents,
        [],
        seed=10,
        coefficients=coeffs,
        event_text="솔라나 악재 발생",
    )
    generic = compute_price_change(
        sol,
        -3.0,
        agents,
        [],
        seed=10,
        coefficients=coeffs,
        event_text="시장 악재 발생",
    )

    assert abs(targeted.event_impact) > abs(generic.event_impact)
    assert targeted.total_pct < generic.total_pct


def test_direct_negative_sol_event_keeps_sol_down():
    sol = _asset("SOL", price=100.0, sector="L1_major", volume=40_000_000_000)
    greedy = [_agent("a", greed=95, fear=5), _agent("b", greed=90, fear=10)]

    b = compute_price_change(
        sol,
        -3.0,
        greedy,
        [],
        seed=4,
        event_text="솔라나 악제 발생",
    )

    assert b.event_impact < 0
    assert b.total_pct < 0
    assert b.new_price < b.old_price


def test_recent_overshoot_can_split_round_direction():
    hot = _asset("BTC", price=108.0, sector="L1_major", history=[100.0, 104.0, 108.0])
    washed_out = _asset("ETH", price=92.0, sector="L1_major", history=[100.0, 96.0, 92.0])
    coeffs = {
        "noise_amplitude": 0.0,
        "event_scale": 0.0,
        "emotion_scale": 0.0,
        "order_scale": 0.0,
    }

    hot_b = compute_price_change(hot, 0.0, [], [], seed=5, coefficients=coeffs)
    washed_b = compute_price_change(washed_out, 0.0, [], [], seed=5, coefficients=coeffs)

    assert hot_b.total_pct < 0
    assert washed_b.total_pct > 0


def test_low_liquidity_trade_moves_more_than_high_liquidity():
    rich = [_agent("a", cash=100_000)]
    high_liq = _asset("BTC", sector="L1_major", volume=100_000_000_000)
    low_liq = _asset("PEPE", sector="meme", volume=1_000_000_000)
    coeffs = {"noise_amplitude": 0.0, "event_scale": 0.0, "emotion_scale": 0.0}

    high = compute_price_change(
        high_liq,
        0.0,
        rich,
        [_buy("a", "BTC", qty=500.0, price=100.0)],
        seed=7,
        coefficients=coeffs,
    )
    low = compute_price_change(
        low_liq,
        0.0,
        rich,
        [_buy("a", "PEPE", qty=500.0, price=100.0)],
        seed=7,
        coefficients=coeffs,
    )

    assert low.order_pressure > high.order_pressure


def test_apply_breakdown_mutates_asset():
    asset = _asset(price=100.0)
    b = compute_price_change(asset, 5.0, [_agent("a", greed=60, fear=40)], [], seed=1)
    apply_breakdown(asset, b)
    assert asset.price == b.new_price
    assert asset.priceHistory[-1] == b.new_price
    assert asset.change24h == b.total_pct


def test_apply_breakdowns_matches_by_symbol():
    a1 = _asset("BTC", 100.0)
    a2 = _asset("ETH", 50.0)
    b1 = compute_price_change(a1, 10.0, [], [], seed=1)
    b2 = compute_price_change(a2, -10.0, [], [], seed=2)
    apply_breakdowns([a1, a2], [b1, b2])
    assert a1.price == b1.new_price
    assert a2.price == b2.new_price
