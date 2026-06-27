"""Tests for FR-2 emotion change (sim/emotion.py)."""

from __future__ import annotations

from sim.emotion import (
    apply_emotion_delta,
    generate_emotion_delta,
    generate_emotion_delta_from_text,
)
from sim.llm import FakeLLM
from sim.models import Agent, EmotionDelta, Event, EventImpact


def _agent(fear: float = 50.0, greed: float = 50.0) -> Agent:
    return Agent(
        id="panic",
        alias="패닉셀 개미",
        type="panic_seller",
        sprite="x.png",
        cash=1_000_000,
        fear=fear,
        greed=greed,
        innate="impulsive, fear-driven, easily panics",
        learned="burned in past crashes",
        currently="anxious about a downturn",
        lifestyle="watches charts all day",
    )


def _event(text: str = "Exchange hacked", impact: EventImpact = EventImpact.NEGATIVE) -> Event:
    return Event(id="e1", round=1, text=text, source="user", impact=impact)


def test_emotion_response_schema():
    client = FakeLLM(response='{"fear_delta": 12.5, "greed_delta": -4}')
    delta = generate_emotion_delta(client, _agent(), _event())
    assert isinstance(delta, EmotionDelta)
    assert isinstance(delta.fear_delta, float)
    assert isinstance(delta.greed_delta, float)
    assert delta.fear_delta == 12.5
    assert delta.greed_delta == -4.0


def test_delta_applied_via_formula():
    agent = _agent(fear=40.0, greed=60.0)
    apply_emotion_delta(agent, EmotionDelta(fear_delta=10.0, greed_delta=-15.0))
    assert agent.fear == 50.0
    assert agent.greed == 45.0


def test_delta_bounds_and_clamp():
    high = _agent(fear=90.0, greed=5.0)
    apply_emotion_delta(high, EmotionDelta(fear_delta=50.0, greed_delta=-50.0))
    assert high.fear == 100.0  # clamped at the ceiling
    assert high.greed == 0.0  # clamped at the floor


def test_bad_news_tends_to_raise_fear():
    # Golden direction: a negative event yielding a positive fear_delta raises fear.
    client = FakeLLM(response='{"fear_delta": 20, "greed_delta": -10}')
    agent = _agent(fear=50.0, greed=50.0)
    delta = generate_emotion_delta(client, agent, _event(impact=EventImpact.NEGATIVE))
    apply_emotion_delta(agent, delta)
    assert agent.fear > 50.0


def test_emotion_llm_failure_zero_delta():
    def boom(user: str, system: str | None):
        raise RuntimeError("network down")

    raising = FakeLLM(handler=boom)
    junk = FakeLLM(response="oops not json")
    for client in (raising, junk):
        delta = generate_emotion_delta(client, _agent(), _event())
        assert delta.fear_delta == 0.0
        assert delta.greed_delta == 0.0


def test_delta_clamped_to_50():
    client = FakeLLM(response='{"fear_delta": 999, "greed_delta": -999}')
    delta = generate_emotion_delta(client, _agent(), _event())
    assert delta.fear_delta == 50.0
    assert delta.greed_delta == -50.0


def test_from_text_contagion():
    # SNS contagion path returns a valid delta too.
    client = FakeLLM(response='{"fear_delta": 5, "greed_delta": 3}')
    delta = generate_emotion_delta_from_text(client, _agent(), "everyone is selling!!")
    assert delta.fear_delta == 5.0
    assert delta.greed_delta == 3.0
