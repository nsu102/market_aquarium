"""Integration tests for the round loop (FR-8) with the LLM fully mocked."""

import json

from sim.engine import MAX_ROUNDS, GameSession, classify_impact
from sim.llm import FakeLLM
from sim.models import EventImpact


def _handler(user: str, system: str | None) -> str:
    """Deterministic LLM double routed by the JSON the module asks for."""
    if "fear_delta" in user:
        return json.dumps({"fear_delta": 8, "greed_delta": -3})
    if "kind" in user:
        return json.dumps({"kind": "POST", "text": "시장이 심상치 않다", "symbol_tags": ["BTC"]})
    if "score" in user:
        return json.dumps({"score": 6})
    return "{}"


def _session(seed: int = 42) -> GameSession:
    return GameSession(num_agents=6, seed=seed, client=FakeLLM(handler=_handler))


def test_classify_impact():
    assert classify_impact("대형 거래소 해킹 소식") == EventImpact.NEGATIVE
    assert classify_impact("솔라나 악재 발생") == EventImpact.NEGATIVE
    assert classify_impact("솔라나 악제 발생") == EventImpact.NEGATIVE
    assert classify_impact("비트코인 ETF 승인") == EventImpact.POSITIVE


def test_one_round_runs_full_flow():
    s = _session()
    rr = s.run_round("대형 거래소 해킹 루머", is_rumor=True)
    assert rr.round == 1
    # posts grew (event broadcast + agent writes)
    assert len(s.posts) > 1
    # at least one asset price changed from the round
    assert any(len(a.priceHistory) >= 2 for a in s.assets)
    # market indices present and bounded
    assert 0 <= s.market.fearGreedIndex <= 100
    assert 0 <= s.market.panicSellRatio <= 1


def test_simulation_is_five_rounds_and_auto_ends():
    s = _session()
    for i in range(MAX_ROUNDS):
        s.run_round(f"이벤트 {i}")
    assert s.round == MAX_ROUNDS
    assert s.finished
    try:
        s.run_round("초과 이벤트")
        assert False, "should refuse a 6th round"
    except RuntimeError:
        pass


def test_round_reproducible_with_mocked_llm():
    a = _session(seed=7)
    b = _session(seed=7)
    for _ in range(3):
        a.run_round("연준 금리 인하 기대")
        b.run_round("연준 금리 인하 기대")
    sa = [(g.id, round(g.cash, 4), round(g.fear, 4), round(g.greed, 4)) for g in a.agents]
    sb = [(g.id, round(g.cash, 4), round(g.fear, 4), round(g.greed, 4)) for g in b.agents]
    assert sa == sb
    assert [round(x.price, 4) for x in a.assets] == [round(x.price, 4) for x in b.assets]


def test_overall_report_after_five_rounds():
    s = _session()
    for i in range(MAX_ROUNDS):
        s.run_round(f"이벤트 {i}")
    rep = s.overall_report()
    assert rep.markdown
    assert len(rep.rounds) == MAX_ROUNDS
    assert len(rep.achievements) >= 1


def test_state_snapshot_shape():
    s = _session()
    s.run_round("비트코인 ETF 승인 루머")
    st = s.state()
    assert {"round", "agents", "market", "posts", "events", "sectors"} <= set(st)
    assert len(st["agents"]) == 6
    assert st["max_rounds"] == MAX_ROUNDS


def test_runs_offline_without_llm_key():
    """No API key -> real client fails safe; the round still completes."""
    s = GameSession(num_agents=6, seed=1)  # default_client(), no key in test env
    rr = s.run_round("시장 급락 공포 확산")
    assert rr.round == 1
    assert 0 <= s.market.fearGreedIndex <= 100
