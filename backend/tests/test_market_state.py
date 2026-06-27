"""Tests for FR-8 market index aggregation (sim/market_state.py)."""

from __future__ import annotations

from sim.market_state import compute_market_data
from sim.models import (
    Action,
    Agent,
    Asset,
    MarketData,
    SentimentContribution,
    TradeResult,
)


def _agent(
    id: str,
    type: str = "panic_seller",
    fear: float = 50.0,
    greed: float = 50.0,
    cash: float = 1_000_000.0,
) -> Agent:
    return Agent(
        id=id,
        alias=f"agent-{id}",
        type=type,
        sprite="x.png",
        cash=cash,
        fear=fear,
        greed=greed,
    )


def _asset(symbol: str = "BTC", price: float = 100.0) -> Asset:
    return Asset(symbol=symbol, name=symbol, price=price)


def _trade(agent_id: str, action: Action, qty: float = 1.0, price: float = 100.0) -> TradeResult:
    return TradeResult(
        agent_id=agent_id,
        action=action,
        symbol="BTC",
        qty=qty,
        price=price,
        cash_after=0.0,
    )


def test_market_data_shape():
    assets = [_asset("BTC"), _asset("ETH", price=50.0)]
    agents = [_agent("a"), _agent("b")]
    md = compute_market_data(agents, assets, trades=[], posts_count=0)

    assert isinstance(md, MarketData)
    # assets are passed through verbatim.
    assert md.assets == assets
    assert [a.symbol for a in md.assets] == ["BTC", "ETH"]
    # all index fields are present and numeric.
    assert isinstance(md.fearGreedIndex, float)
    assert isinstance(md.rumorSpeed, float)
    assert isinstance(md.panicSellRatio, float)
    assert isinstance(md.fomoBuyRatio, float)
    assert isinstance(md.whaleBuyIntensity, float)
    assert isinstance(md.whaleSellIntensity, float)
    assert isinstance(md.sentimentContribution, list)
    assert all(isinstance(s, SentimentContribution) for s in md.sentimentContribution)


def test_fear_greed_index_bounds():
    # All-greedy population saturates high.
    greedy = [_agent("a", greed=100.0, fear=0.0), _agent("b", greed=100.0, fear=0.0)]
    md_greedy = compute_market_data(greedy, [])
    assert md_greedy.fearGreedIndex == 100.0

    # All-fearful population saturates low.
    fearful = [_agent("a", greed=0.0, fear=100.0), _agent("b", greed=0.0, fear=100.0)]
    md_fearful = compute_market_data(fearful, [])
    assert md_fearful.fearGreedIndex == 0.0

    # Balanced population sits at the neutral midpoint.
    balanced = [_agent("a", greed=50.0, fear=50.0)]
    md_balanced = compute_market_data(balanced, [])
    assert md_balanced.fearGreedIndex == 50.0

    # Always within [0, 100], including extreme mixes.
    mixed = [_agent("a", greed=100.0, fear=100.0), _agent("b", greed=0.0, fear=0.0)]
    md_mixed = compute_market_data(mixed, [])
    assert 0.0 <= md_mixed.fearGreedIndex <= 100.0


def test_panic_sell_ratio():
    # N = 4 agents, k = 3 SELL trades => 3/4.
    agents = [_agent("a"), _agent("b"), _agent("c"), _agent("d")]
    trades = [
        _trade("a", Action.SELL),
        _trade("b", Action.SELL),
        _trade("c", Action.SELL),
        _trade("d", Action.HOLD),
    ]
    md = compute_market_data(agents, [], trades=trades)
    assert md.panicSellRatio == 3 / 4


def test_fomo_buy_ratio():
    # BUY and BUY_LARGE both count toward fomoBuyRatio. 2 of 4 agents buy.
    agents = [_agent("a"), _agent("b"), _agent("c"), _agent("d")]
    trades = [
        _trade("a", Action.BUY),
        _trade("b", Action.BUY_LARGE),
        _trade("c", Action.SELL),
        _trade("d", Action.HOLD),
    ]
    md = compute_market_data(agents, [], trades=trades)
    assert md.fomoBuyRatio == 2 / 4


def test_whale_buy_intensity():
    # A whale BUY_LARGE alongside another agent's plain BUY => whale share in (0, 1].
    agents = [_agent("w", type="whale"), _agent("a", type="fomo_trader")]
    trades = [
        _trade("w", Action.BUY_LARGE, qty=10.0, price=100.0),  # whale notional 1000
        _trade("a", Action.BUY, qty=1.0, price=100.0),  # other notional 100
    ]
    md = compute_market_data(agents, [], trades=trades)
    assert 0.0 < md.whaleBuyIntensity <= 1.0
    # whale notional 1000 / total 1100.
    assert md.whaleBuyIntensity == 1000.0 / 1100.0
    # no whale sells this round.
    assert md.whaleSellIntensity == 0.0


def test_sentiment_contribution_per_agent():
    agents = [
        _agent("greedy", greed=90.0, fear=10.0),  # positive
        _agent("fearful", greed=10.0, fear=90.0),  # negative
        _agent("neutral", greed=50.0, fear=50.0),  # zero
    ]
    md = compute_market_data(agents, [])
    assert len(md.sentimentContribution) == len(agents)

    by_alias = {s.agent: s.value for s in md.sentimentContribution}
    assert by_alias["agent-greedy"] > 0
    assert by_alias["agent-fearful"] < 0
    assert by_alias["agent-neutral"] == 0.0
    # all within [-1, 1].
    assert all(-1.0 <= v <= 1.0 for v in by_alias.values())


def test_empty_inputs_safe():
    md = compute_market_data([], [])
    assert isinstance(md, MarketData)
    assert md.assets == []
    assert md.fearGreedIndex == 50.0  # neutral default
    assert md.rumorSpeed == 0.0
    assert md.panicSellRatio == 0.0
    assert md.fomoBuyRatio == 0.0
    assert md.whaleBuyIntensity == 0.0
    assert md.whaleSellIntensity == 0.0
    assert md.sentimentContribution == []
