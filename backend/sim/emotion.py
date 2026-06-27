"""FR-2: emotion change (fear/greed delta) via the LLM.

For an event -- or a board post/comment seen during SNS contagion (FR-3) -- the
LLM judges how the agent's fear and greed should move. The agent's scratch
personality (innate/learned/currently/lifestyle) is injected into the prompt so
the same event moves a panic seller and a whale in different directions.

The returned delta is clamped to a sane per-call range and then applied to the
agent with [0, 100] clamping. ``safe_json`` guarantees the loop never crashes on
an LLM hiccup -- a zero delta is used as the fallback.
"""

from __future__ import annotations

from .llm import LLMClient, safe_json
from .models import Agent, EmotionDelta, Event

# Per-call delta bounds. The prompt asks for ~[-30, 30]; we hard-clamp to [-50,
# 50] so a hallucinated huge number cannot swing an agent across the whole scale.
_DELTA_MIN = -50.0
_DELTA_MAX = 50.0

# Agent state bounds.
_STATE_MIN = 0.0
_STATE_MAX = 100.0

_FALLBACK: dict[str, float] = {"fear_delta": 0.0, "greed_delta": 0.0}

_SYSTEM = (
    "You are simulating one investor's emotional reaction inside a market "
    "psychology game. Output strict JSON only."
)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _persona_block(agent: Agent) -> str:
    """Render the agent's scratch personality for prompt injection."""
    return (
        f"Investor: {agent.alias} (type: {agent.type})\n"
        f"- innate: {agent.innate}\n"
        f"- learned: {agent.learned}\n"
        f"- currently: {agent.currently}\n"
        f"- lifestyle: {agent.lifestyle}\n"
        f"- current fear: {agent.fear:.0f}/100, current greed: {agent.greed:.0f}/100"
    )


def _ask_delta(client: LLMClient, persona: str, stimulus: str) -> EmotionDelta:
    """Shared LLM call + parse + clamp used by both public entry points."""
    user = (
        f"{persona}\n\n"
        f"{stimulus}\n\n"
        "Given this investor's personality and current emotional state, how do "
        "their fear and greed change in reaction? A negative delta lowers the "
        "value, a positive delta raises it. Stay in roughly the range -30 to 30.\n"
        'Respond with JSON only: {"fear_delta": number, "greed_delta": number}'
    )
    data = safe_json(client, user, fallback=_FALLBACK, system=_SYSTEM)
    fear_delta = _clamp(_as_float(data.get("fear_delta"), 0.0), _DELTA_MIN, _DELTA_MAX)
    greed_delta = _clamp(_as_float(data.get("greed_delta"), 0.0), _DELTA_MIN, _DELTA_MAX)
    return EmotionDelta(fear_delta=fear_delta, greed_delta=greed_delta)


def _as_float(value: object, default: float) -> float:
    """Coerce an LLM-supplied value to float, falling back on junk."""
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def generate_emotion_delta(client: LLMClient, agent: Agent, event: Event) -> EmotionDelta:
    """LLM-judged fear/greed delta for ``agent`` reacting to ``event``."""
    rumor = " (unverified rumor)" if event.is_rumor else ""
    stimulus = f'Event (impact: {event.impact.value}{rumor}):\n"{event.text}"'
    return _ask_delta(client, _persona_block(agent), stimulus)


def generate_emotion_delta_from_text(
    client: LLMClient, agent: Agent, text: str, kind: str = "post"
) -> EmotionDelta:
    """LLM-judged fear/greed delta for ``agent`` reading a board ``text``.

    Used by SNS emotional contagion (FR-3): a fearful post should raise fear,
    a greedy/hype post should raise greed, scaled by the reader's personality.
    """
    stimulus = f'Board {kind} the investor just read:\n"{text}"'
    return _ask_delta(client, _persona_block(agent), stimulus)


def apply_emotion_delta(agent: Agent, delta: EmotionDelta) -> None:
    """Apply ``delta`` to the agent in place, clamping fear/greed to [0, 100]."""
    agent.fear = _clamp(agent.fear + delta.fear_delta, _STATE_MIN, _STATE_MAX)
    agent.greed = _clamp(agent.greed + delta.greed_delta, _STATE_MIN, _STATE_MAX)
