"""Tests for FR-3 SNS view (read feed + write one utterance)."""

from __future__ import annotations

import json

import pytest

from sim.llm import FakeLLM, LLMError
from sim.models import (
    Agent,
    Comment,
    Event,
    EventImpact,
    Post,
    WriteKind,
)
from sim.sns import apply_sns_write, view_sns


def make_agent(agent_id: str = "a1", alias: str = "손절 금붕어") -> Agent:
    return Agent(
        id=agent_id,
        alias=alias,
        type="panic_seller",
        sprite="fish",
        cash=10000.0,
        currently="시장 분위기를 살피는 중",
    )


def make_event() -> Event:
    return Event(
        id="e1",
        round=1,
        text="대형 거래소 해킹 소식이 퍼졌다",
        impact=EventImpact.NEGATIVE,
        is_rumor=True,
    )


def make_thread(thread_id: str = "p_seed_1_0", likes: int = 0) -> Post:
    return Post(
        id=thread_id,
        agentId="seed",
        agentAlias="가치투자자",
        content="신뢰도 낮은 루머에 가격이 과민반응 중",
        likes=likes,
        round=1,
    )


def skip_llm() -> FakeLLM:
    return FakeLLM(response=json.dumps({"kind": "SKIP"}))


def test_view_sns_reads_full_feed_and_event():
    event = make_event()
    threads = [make_thread()]
    result = view_sns(skip_llm(), make_agent(), event, threads, round=1, timestamp="t0")

    assert result.injected_thoughts, "feed read should produce thoughts"
    blob = " ".join(t.text for t in result.injected_thoughts)
    assert event.text in blob, "event must be injected"
    assert threads[0].content in blob, "existing thread must be injected"
    assert all(1.0 <= t.poignancy <= 10.0 for t in result.injected_thoughts)
    assert all(t.created == "t0" for t in result.injected_thoughts)


def test_exactly_one_llm_call_per_view():
    client = skip_llm()
    view_sns(client, make_agent(), make_event(), [make_thread()], round=1)
    assert len(client.calls) == 1, "only the write decision should hit the LLM"


def test_write_kinds_include_skip():
    threads = [make_thread()]
    before = len(threads)
    result = view_sns(skip_llm(), make_agent(), make_event(), threads, round=1)
    assert result.write.kind is WriteKind.SKIP
    out = apply_sns_write(result.write, make_agent(), threads, round=1)
    assert out is None
    assert len(threads) == before, "SKIP must not mutate the feed"


def test_post_creates_new_thread():
    client = FakeLLM(response=json.dumps({"kind": "POST", "text": "저도 불안해서 팔았습니다"}))
    threads: list[Post] = []
    result = view_sns(client, make_agent(), make_event(), threads, round=1)
    assert result.write.kind is WriteKind.POST
    post = apply_sns_write(result.write, make_agent(), threads, round=1, timestamp="t1")
    assert post is not None
    assert len(threads) == 1
    assert threads[0] is post
    assert post.content == "저도 불안해서 팔았습니다"
    assert post.agentId == "a1"


def test_comment_appends_to_thread():
    thread = make_thread("p_seed_1_0")
    threads = [thread]
    client = FakeLLM(
        response=json.dumps(
            {"kind": "COMMENT", "text": "동의합니다", "target_thread_id": "p_seed_1_0"}
        )
    )
    result = view_sns(client, make_agent(), make_event(), threads, round=1)
    assert result.write.kind is WriteKind.COMMENT
    touched = apply_sns_write(result.write, make_agent(), threads, round=1)
    assert touched is thread
    assert len(thread.comments) == 1
    assert thread.comments[0].content == "동의합니다"


def test_reply_appends_to_thread():
    thread = make_thread("p_seed_1_0")
    thread.comments.append(Comment(agentId="x", agentAlias="퀀트", content="패닉셀 비율 높음"))
    threads = [thread]
    client = FakeLLM(
        response=json.dumps(
            {"kind": "REPLY", "text": "반박합니다", "target_thread_id": "p_seed_1_0"}
        )
    )
    result = view_sns(client, make_agent(), make_event(), threads, round=1)
    assert result.write.kind is WriteKind.REPLY
    touched = apply_sns_write(result.write, make_agent(), threads, round=1)
    assert touched is thread
    assert len(thread.comments) == 2
    assert thread.comments[-1].content == "반박합니다"


def test_target_thread_auto_selected():
    low = make_thread("p_low", likes=1)
    high = make_thread("p_high", likes=9)
    threads = [low, high]
    # COMMENT without a target_thread_id -> must auto-pick (highest likes here).
    client = FakeLLM(response=json.dumps({"kind": "COMMENT", "text": "끼어듭니다"}))
    result = view_sns(client, make_agent(), make_event(), threads, round=1)
    assert result.write.kind is WriteKind.COMMENT
    assert result.write.target_thread_id == "p_high"
    touched = apply_sns_write(result.write, make_agent(), threads, round=1)
    assert touched is high
    assert len(high.comments) == 1
    assert len(low.comments) == 0


def test_view_sns_llm_failure_safe_default():
    class BoomLLM(FakeLLM):
        def chat(self, user, system=None, temperature=0.7):  # noqa: D401
            self.calls.append((user, system))
            raise LLMError("boom")

    threads = [make_thread()]
    result = view_sns(BoomLLM(), make_agent(), make_event(), threads, round=1, timestamp="t0")
    assert result.write.kind is WriteKind.SKIP
    assert result.injected_thoughts, "thoughts still produced despite LLM failure"


def test_shared_thread_grows():
    thread = make_thread("p_seed_1_0")
    threads = [thread]
    client = FakeLLM(
        response=json.dumps(
            {"kind": "COMMENT", "text": "1번 의견", "target_thread_id": "p_seed_1_0"}
        )
    )
    a1 = make_agent("a1", "개미1")
    a2 = make_agent("a2", "개미2")

    r1 = view_sns(client, a1, make_event(), threads, round=1)
    apply_sns_write(r1.write, a1, threads, round=1)

    client2 = FakeLLM(
        response=json.dumps(
            {"kind": "COMMENT", "text": "2번 의견", "target_thread_id": "p_seed_1_0"}
        )
    )
    r2 = view_sns(client2, a2, make_event(), threads, round=2)
    apply_sns_write(r2.write, a2, threads, round=2)

    assert len(threads) == 1, "comments must accumulate on the shared thread"
    assert len(thread.comments) == 2
    assert [c.agentAlias for c in thread.comments] == ["개미1", "개미2"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
