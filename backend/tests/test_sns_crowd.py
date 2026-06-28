"""Tests for the SNS-only crowd (D2), like/dislike settlement (D4) and the
extra emotion axes (D3): all wired through the round loop with a mocked LLM."""

import json

from sim.engine import GameSession
from sim.emotion import apply_vote_emotion
from sim.llm import FakeLLM
from sim.models import Agent


def _handler(user: str, system: str | None) -> str:
    if "fear_delta" in user:
        return json.dumps({
            "fear_delta": 6, "greed_delta": -2,
            "confidence_delta": 3, "excitement_delta": 5, "trust_delta": -4,
        })
    if "kind" in user:
        return json.dumps({"kind": "POST", "text": "가즈아 ㅋㅋ", "symbol_tags": ["BTC"]})
    if "score" in user:
        return json.dumps({"score": 6})
    return "{}"


def _session(seed: int = 42) -> GameSession:
    return GameSession(num_agents=6, seed=seed, client=FakeLLM(handler=_handler))


def test_sns_agents_created_same_count_as_players():
    s = _session()
    assert len(s.sns_agents) == len(s.agents) == 6
    assert all(a.sns_only for a in s.sns_agents)
    assert all(not a.sns_only for a in s.agents)


def test_sns_agents_each_write_every_round():
    s = _session()
    s.run_round("비트코인 급등")
    sns_ids = {a.id for a in s.sns_agents}
    authors = {p.agentId for p in s.posts} | {
        c.agentId for p in s.posts for c in p.comments
    }
    # every spectator left at least one post or comment this round
    assert sns_ids <= authors


def test_sns_agents_cast_votes():
    s = _session()
    s.run_round("대형 거래소 해킹")
    round_posts = [p for p in s.posts if p.round == 1]
    assert sum(p.likes + p.dislikes for p in round_posts) > 0


def test_vote_settlement_moves_confidence():
    a = Agent(id="x", alias="t", type="fomo_trader", sprite="", cash=0, confidence=50.0)
    apply_vote_emotion(a, 4)      # net +4 likes
    assert a.confidence > 50.0
    apply_vote_emotion(a, -10)    # net dislikes
    assert a.confidence < 54.0


def test_emotion_deltas_exposed_in_state():
    s = _session()
    s.run_round("연준 금리 인하")
    st = s.state()
    assert "sns_agents" in st and len(st["sns_agents"]) == 6
    assert "emotion_deltas" in st
    # players + spectators all have a 5-axis delta entry
    assert len(st["emotion_deltas"]) == 12
    any_axis = next(iter(st["emotion_deltas"].values()))
    assert {"fear", "greed", "confidence", "excitement", "trust"} == set(any_axis)


def test_five_axes_present_on_agents():
    s = _session()
    st = s.state()
    a = st["agents"][0]
    for axis in ("confidence", "excitement", "trust"):
        assert 0 <= a[axis] <= 100


# --- Plan §2: timer scenario ------------------------------------------------ #
def test_scenario_built_and_time_ordered():
    s = _session()
    s.run_round("비트코인 급등")
    sc = s.state()["scenario"]
    assert sc and sc["duration_min"] == 1440
    acts = sc["actions"]
    assert acts, "scenario must have actions"
    # time-ordered and bounded
    ts = [a["t"] for a in acts]
    assert ts == sorted(ts)
    assert all(0 <= t <= 1440 for t in ts)
    assert {a["kind"] for a in acts} <= {"post", "comment", "like", "dislike"}


def test_first_two_agents_post_only_and_lead():
    s = _session()
    s.run_round("대형 거래소 해킹")
    openers = [s.agents[0].id, s.agents[1].id]
    # each opener authored a POST this round
    round_posts = [p for p in s.posts if p.round == 1]
    for oid in openers:
        assert any(p.agentId == oid for p in round_posts)
    # openers never commented this round (post-only)
    for p in s.posts:
        for c in p.comments:
            if getattr(c, "round", 1) == 1:
                assert c.agentId not in openers
    # the two earliest scenario actions are the openers' posts
    acts = s.state()["scenario"]["actions"]
    lead = [a for a in acts if a["kind"] == "post"][:2]
    lead_authors = {next(p.agentId for p in s.posts if p.id == a["post_id"]) for a in lead}
    assert lead_authors == set(openers)


def test_scenario_parent_appears_before_child():
    s = _session()
    s.run_round("연준 금리 인하")
    acts = s.state()["scenario"]["actions"]
    post_t = {a["post_id"]: a["t"] for a in acts if a["kind"] == "post"}
    for a in acts:
        if a["kind"] != "post" and a["post_id"] in post_t:
            assert a["t"] >= post_t[a["post_id"]], "reply/vote before its thread"
