"""FR-2b: news credibility judgement (PRD §1.5).

A poig_score-style 1..10 rating of how credible a piece of news/rumor is to a
*specific* agent. The agent's scratch personality is embedded in the prompt, so
a skeptical persona (e.g. the value investor) naturally rates an unsourced rumor
lower than a credulous persona does -- the personality reaches the LLM for free,
exactly like poignancy scoring.

The score is purely advisory here. Downstream logic (trade/react module) decides
whether a sub-threshold score should suppress the agent's reaction; that branch
does not live in this module.

LLM use goes through ``safe_json`` so the simulation loop never crashes on an
LLM hiccup -- on any failure we fall back to a neutral score of 5 (PRD §2.4).
"""

from __future__ import annotations

from .llm import LLMClient, safe_json
from .models import Agent

# Default credibility threshold: at or above this, news is "credible enough"
# to act on. Below it, downstream logic may suppress the reaction.
DEFAULT_THRESHOLD = 4


def _build_prompt(agent: Agent, news_text: str, source: str | None, is_rumor: bool) -> str:
    """English prompt embedding the agent's scratch personality so cautious
    personas judge unsourced rumors as less credible."""
    source_line = source if source else "unknown / unattributed"
    return (
        "You are judging how credible a piece of market news is, in character.\n\n"
        f"Your personality (innate): {agent.innate}\n"
        f"Background (learned): {agent.learned}\n"
        f"Current mindset: {agent.currently}\n"
        f"Lifestyle: {agent.lifestyle}\n\n"
        f"News: {news_text}\n"
        f"Source: {source_line}\n"
        f"Flagged as a rumor: {'yes' if is_rumor else 'no'}\n\n"
        "On a scale of 1 to 10, how credible does THIS news feel to YOU, given "
        "your personality? 1 = obviously fake/unreliable rumor, 10 = highly "
        "trustworthy and well-sourced. A skeptical, analytical investor should "
        "rate unsourced rumors low; a credulous, impulsive one may rate them "
        "higher.\n"
        'Respond ONLY with JSON: {"score": <integer 1..10>}'
    )


def generate_news_credibility(
    client: LLMClient,
    agent: Agent,
    news_text: str,
    source: str | None = None,
    is_rumor: bool = False,
    memory_adjust: int = 0,
) -> int:
    """Return a 1..10 credibility score for ``news_text`` as judged by ``agent``.

    ``memory_adjust`` shifts the LLM score (e.g. a prior bad experience with the
    source contributes a negative adjustment). The final value is clamped to
    [1, 10]. On any LLM failure the neutral fallback score of 5 is used.
    """
    prompt = _build_prompt(agent, news_text, source, is_rumor)
    result = safe_json(client, prompt, fallback={"score": 5})

    try:
        score = int(result.get("score", 5))
    except (TypeError, ValueError):
        score = 5

    score += int(memory_adjust)
    # Clamp to the valid 1..10 range.
    score = max(1, min(10, score))
    return score


def is_credible(score: int, threshold: int = DEFAULT_THRESHOLD) -> bool:
    """True if ``score`` meets or exceeds the credibility ``threshold``."""
    return score >= threshold
