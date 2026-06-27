"""Tests for FR-2b news credibility (sim/credibility.py)."""

from __future__ import annotations

import json

import pytest

from sim.credibility import generate_news_credibility, is_credible
from sim.llm import FakeLLM
from sim.models import Agent


def make_agent(**scratch) -> Agent:
    base = dict(
        id="a1",
        alias="tester",
        type="value_investor",
        sprite="x.png",
        cash=1_000_000.0,
    )
    base.update(scratch)
    return Agent(**base)


SKEPTIC_INNATE = "skeptical, analytical, demands evidence, distrusts rumors"
CREDULOUS_INNATE = "impulsive, gullible, believes everything on the board"


def test_credibility_score_in_range_1_10():
    agent = make_agent()
    high = generate_news_credibility(
        FakeLLM(response=json.dumps({"score": 99})), agent, "big news"
    )
    low = generate_news_credibility(
        FakeLLM(response=json.dumps({"score": -3})), agent, "big news"
    )
    assert high == 10
    assert low == 1
    assert 1 <= high <= 10 and 1 <= low <= 10


def test_value_investor_scores_rumor_lower():
    rumor = "Unconfirmed: a major exchange may have been hacked."

    def handler(user: str, system):
        # Personality reaches the prompt -> a skeptic rates a rumor low.
        if SKEPTIC_INNATE in user and "Flagged as a rumor: yes" in user:
            return json.dumps({"score": 2})
        return json.dumps({"score": 8})

    skeptic = make_agent(innate=SKEPTIC_INNATE)
    credulous = make_agent(innate=CREDULOUS_INNATE)

    skeptic_score = generate_news_credibility(
        FakeLLM(handler=handler), skeptic, rumor, is_rumor=True
    )
    credulous_score = generate_news_credibility(
        FakeLLM(handler=handler), credulous, rumor, is_rumor=True
    )
    assert skeptic_score < credulous_score


def test_memory_adjusts_credibility():
    agent = make_agent()
    base = generate_news_credibility(
        FakeLLM(response=json.dumps({"score": 7})), agent, "news", memory_adjust=0
    )
    worse = generate_news_credibility(
        FakeLLM(response=json.dumps({"score": 7})), agent, "news", memory_adjust=-3
    )
    assert worse < base
    assert worse == 4


def test_credibility_llm_failure_neutral_default():
    agent = make_agent()

    def boom(user, system):
        raise RuntimeError("llm down")

    raises = generate_news_credibility(FakeLLM(handler=boom), agent, "news")
    garbage = generate_news_credibility(
        FakeLLM(response="not json at all"), agent, "news"
    )
    assert raises == 5
    assert garbage == 5


def test_is_credible_threshold():
    assert is_credible(3) is False
    assert is_credible(5) is True
