"""FR-3: "SNS 보기" -- read the board feed and write ONE utterance.

When an agent arrives at the community board it performs a single composite
action (PRD decision B):

1. READ the whole feed (the active event + every thread and its comments) and
   inject it into associative memory as ``InjectedThought`` nodes. This is the
   emotional-contagion input; the actual fear/greed update is done later by the
   emotion module (FR-2) which consumes these thoughts -- it is NOT done here.
2. WRITE exactly one utterance via a single LLM call: a new POST, a COMMENT on a
   thread, a REPLY to a comment, or SKIP (stay silent). A thread is the shared
   accumulator (a Post plus its comments), so comments pile up across agents.

This module depends ONLY on sim.models, sim.llm and the stdlib.
"""

from __future__ import annotations

from .llm import LLMClient, safe_json
from .models import (
    Agent,
    Comment,
    Event,
    EventImpact,
    InjectedThought,
    Post,
    SnsResult,
    SnsWrite,
    WriteKind,
)

# Poignancy heuristic bounds (PRD §5.2: a 1..10 psychological-impact score).
_POIGNANCY_MIN = 1.0
_POIGNANCY_MAX = 10.0

# Words that make a stimulus feel more "poignant" (fearful or hype-y). Mixed
# Korean/English so it works on both LLM-authored and seeded content.
_HOT_WORDS = (
    "폭락", "급락", "해킹", "공포", "패닉", "손절", "루머", "전쟁", "규제", "상장폐지",
    "급등", "떡상", "불장", "추매", "전액",
    "crash", "dump", "hack", "panic", "fear", "rumor", "war", "moon", "fomo", "pump",
)

_SYSTEM = (
    "You are simulating one investor browsing a market community board in a "
    "psychology game. You read the feed, then decide whether to speak once. "
    "Output strict JSON only."
)

_FALLBACK: dict[str, object] = {"kind": "SKIP"}


# --------------------------------------------------------------------------- #
# Reading the feed -> injected thoughts (no LLM; deterministic heuristic)
# --------------------------------------------------------------------------- #
def _poignancy(text: str, *, is_rumor: bool = False, impact: EventImpact | None = None) -> float:
    """Cheap 1..10 score: negative/rumor and emotionally charged text score higher."""
    score = 4.0
    if impact is EventImpact.NEGATIVE:
        score += 3.0
    elif impact is EventImpact.POSITIVE:
        score += 1.0
    if is_rumor:
        score += 2.0
    low = text.lower()
    for word in _HOT_WORDS:
        if word in text or word in low:
            score += 1.0
    return max(_POIGNANCY_MIN, min(_POIGNANCY_MAX, score))


def read_feed(event: Event, threads: list[Post], created: str = "") -> list[InjectedThought]:
    """Summarize the event and each thread into injected thought nodes.

    One thought for the event, then one per thread (post + its comments folded
    into the text so contagion sees the whole conversation).
    """
    thoughts: list[InjectedThought] = [
        InjectedThought(
            text=f"Event: {event.text}",
            poignancy=_poignancy(event.text, is_rumor=event.is_rumor, impact=event.impact),
            created=created,
        )
    ]
    for thread in threads:
        comment_tail = ""
        if thread.comments:
            joined = " | ".join(f"{c.agentAlias}: {c.content}" for c in thread.comments)
            comment_tail = f" (comments: {joined})"
        body = f"{thread.agentAlias}: {thread.content}{comment_tail}"
        thoughts.append(
            InjectedThought(
                text=body,
                poignancy=_poignancy(thread.content),
                created=created,
            )
        )
    return thoughts


# --------------------------------------------------------------------------- #
# Deciding the single write (one LLM call)
# --------------------------------------------------------------------------- #
def _auto_target(threads: list[Post]) -> str | None:
    """Pick a thread to reply to: highest likes, ties broken by most recent."""
    if not threads:
        return None
    best = max(enumerate(threads), key=lambda pair: (pair[1].likes, pair[0]))
    return best[1].id


def _thread_by_id(threads: list[Post], thread_id: str | None) -> Post | None:
    if not thread_id:
        return None
    for thread in threads:
        if thread.id == thread_id:
            return thread
    return None


def _persona_block(agent: Agent) -> str:
    return (
        f"Investor: {agent.alias} (type: {agent.type})\n"
        f"- innate: {agent.innate}\n"
        f"- currently: {agent.currently}\n"
        f"- fear: {agent.fear:.0f}/100, greed: {agent.greed:.0f}/100"
    )


def _feed_block(event: Event, threads: list[Post]) -> str:
    lines = [f'Active event: "{event.text}" (impact: {event.impact.value})', "", "Board threads:"]
    if not threads:
        lines.append("(the board is empty)")
    for thread in threads:
        lines.append(f"- id={thread.id} likes={thread.likes} | {thread.agentAlias}: {thread.content}")
        for comment in thread.comments:
            lines.append(f"    > {comment.agentAlias}: {comment.content}")
    return "\n".join(lines)


def _as_str_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(v) for v in value if str(v)]
    if isinstance(value, str) and value:
        return [value]
    return []


def decide_write(
    client: LLMClient, agent: Agent, event: Event, threads: list[Post]
) -> SnsWrite:
    """One LLM call -> the single utterance (or SKIP). Never raises."""
    user = (
        f"{_persona_block(agent)}\n\n"
        f"{_feed_block(event, threads)}\n\n"
        "You just read this feed. Decide your single reaction, true to your "
        "personality. You may post something new, comment on a thread, reply "
        "into a thread's discussion, or stay silent.\n"
        "Respond with JSON only: "
        '{"kind": "POST|COMMENT|REPLY|SKIP", "text": "your short Korean message", '
        '"target_thread_id": "id of the thread for COMMENT/REPLY or null", '
        '"symbol_tags": ["TICKER", ...]}'
    )
    data = safe_json(client, user, fallback=_FALLBACK, system=_SYSTEM)

    # --- validate kind --------------------------------------------------- #
    raw_kind = str(data.get("kind", "SKIP")).upper()
    try:
        kind = WriteKind(raw_kind)
    except ValueError:
        kind = WriteKind.SKIP

    text = data.get("text")
    text = str(text) if text not in (None, "") else None
    symbol_tags = _as_str_list(data.get("symbol_tags"))
    target_id = data.get("target_thread_id")
    target_id = str(target_id) if target_id not in (None, "") else None

    # A speaking write with no text is meaningless -> stay silent.
    if kind is not WriteKind.SKIP and text is None:
        kind = WriteKind.SKIP

    # --- resolve target for COMMENT/REPLY -------------------------------- #
    if kind in (WriteKind.COMMENT, WriteKind.REPLY):
        target = _thread_by_id(threads, target_id)
        if target is None:
            # LLM gave no/invalid target: auto-pick the most relevant thread.
            target_id = _auto_target(threads)
            if target_id is None:
                # Nothing to comment on -> turn it into a fresh post instead.
                kind = WriteKind.POST
    elif kind is WriteKind.POST:
        target_id = None

    if kind is WriteKind.SKIP:
        return SnsWrite(kind=WriteKind.SKIP)

    # sector derivation needs the asset universe which is out of this module's
    # dependency scope; leave it "" (unknown) per the contract.
    return SnsWrite(
        kind=kind,
        text=text,
        target_thread_id=target_id if kind in (WriteKind.COMMENT, WriteKind.REPLY) else None,
        sector="",
        symbol_tags=symbol_tags,
    )


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #
def view_sns(
    client: LLMClient,
    agent: Agent,
    event: Event,
    threads: list[Post],
    round: int,
    timestamp: str = "",
) -> SnsResult:
    """Read the whole feed (contagion input) and produce one utterance.

    Exactly one LLM call is made (the write decision); the injected thoughts are
    built deterministically so the read half stays stable and cost-free.
    """
    injected = read_feed(event, threads, created=timestamp)
    write = decide_write(client, agent, event, threads)
    return SnsResult(injected_thoughts=injected, write=write)


def apply_sns_write(
    write: SnsWrite,
    agent: Agent,
    threads: list[Post],
    round: int,
    timestamp: str = "",
) -> Post | None:
    """Apply a decided write to the shared thread list (mutates ``threads``).

    POST appends and returns a new thread; COMMENT/REPLY appends a comment and
    returns the touched thread; SKIP returns None and leaves threads unchanged.
    """
    if write.kind is WriteKind.SKIP:
        return None

    if write.kind is WriteKind.POST:
        post = Post(
            id=f"p_{agent.id}_{round}_{len(threads)}",
            agentId=agent.id,
            agentAlias=agent.alias,
            content=write.text or "",
            asset=write.symbol_tags[0] if write.symbol_tags else None,
            sector=write.sector,
            symbol_tags=list(write.symbol_tags),
            timestamp=timestamp,
            round=round,
        )
        threads.append(post)
        return post

    # COMMENT or REPLY -> append to the targeted thread (newest as fallback).
    target = _thread_by_id(threads, write.target_thread_id)
    if target is None:
        if not threads:
            return None
        target = threads[-1]
    target.comments.append(
        Comment(agentId=agent.id, agentAlias=agent.alias, content=write.text or "")
    )
    return target
