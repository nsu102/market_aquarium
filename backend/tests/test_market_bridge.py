"""Canonical integration: MarketContext arrival-driven flow, reverie engine-free."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "reverie" / "backend_server"))

import market_bridge as mb  # noqa: E402
from sim.llm import FakeLLM  # noqa: E402

NAMES = list(mb.CHARACTER_TO_PERSONA.keys())  # the 6 the_ville characters


def _handler(user, system):
    if "fear_delta" in user:
        return json.dumps({"fear_delta": 8, "greed_delta": -3})
    if "kind" in user:
        return json.dumps({"kind": "POST", "text": "시장이 심상치 않다", "symbol_tags": ["BTC"]})
    if "score" in user:
        return json.dumps({"score": 6})
    return "{}"


def _ctx(seed=42):
    return mb.MarketContext(NAMES, seed=seed, client=FakeLLM(handler=_handler))


def test_force_address_maps_injected_activities():
    assert mb.force_address(mb.BOARD_ACTIVITY) == mb.BOARD_ADDRESS
    assert mb.force_address(mb.EXCHANGE_ACTIVITY) == mb.EXCHANGE_ADDRESS
    assert mb.force_address("eating breakfast") is None


def test_context_builds_agent_per_persona():
    ctx = _ctx()
    assert len(ctx.agents) == 6
    assert set(ctx.agents) == set(NAMES)


def test_arrival_driven_round_full_flow():
    ctx = _ctx()
    ctx.set_event("대형 거래소 해킹 루머", is_rumor=True)
    assert ctx.current_event is not None
    # board arrivals first (SNS), then exchange arrivals (trade)
    for n in NAMES:
        ctx.on_arrive_board(n, timestamp="Day1")
    assert len(ctx.posts) > 1  # event headline + agent posts
    for n in NAMES:
        ctx.on_arrive_exchange(n)
    rr = ctx.end_round()
    assert rr.round == 1
    assert any(len(a.priceHistory) >= 2 for a in ctx.assets)  # price moved
    assert 0 <= ctx.market.fearGreedIndex <= 100
    assert 0.0 <= rr.emotion_contribution_share <= 1.0


def test_sns_once_and_trade_once_per_round():
    ctx = _ctx()
    ctx.set_event("비트코인 ETF 승인")
    name = NAMES[0]
    ctx.on_arrive_board(name)
    posts_after_first = len(ctx.posts)
    ctx.on_arrive_board(name)  # second arrival same round -> no-op
    assert len(ctx.posts) == posts_after_first
    ctx.on_arrive_exchange(name)
    trades_after_first = len(ctx._round_trades)
    ctx.on_arrive_exchange(name)  # second -> no-op
    assert len(ctx._round_trades) == trades_after_first


def test_reproducible_with_mocked_llm():
    def run():
        c = mb.MarketContext(NAMES, seed=7, client=FakeLLM(handler=_handler))
        for _ in range(3):
            c.set_event("연준 금리 인하 기대")
            for n in NAMES:
                c.on_arrive_board(n)
            for n in NAMES:
                c.on_arrive_exchange(n)
            c.end_round()
        return c
    a, b = run(), run()
    sa = [(n, round(g.cash, 4), round(g.fear, 4)) for n, g in a.agents.items()]
    sb = [(n, round(g.cash, 4), round(g.fear, 4)) for n, g in b.agents.items()]
    assert sa == sb
    assert [round(x.price, 4) for x in a.assets] == [round(x.price, 4) for x in b.assets]


def test_runs_offline_with_scripted_client():
    ctx = mb.MarketContext(NAMES, seed=1)  # no key -> scripted client
    ctx.set_event("시장 급락 공포 확산")
    for n in NAMES:
        ctx.on_arrive_board(n)
    for n in NAMES:
        ctx.on_arrive_exchange(n)
    rr = ctx.end_round()
    assert len(ctx.posts) > 1
    assert rr.round == 1
