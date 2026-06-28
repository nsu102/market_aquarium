"""Event card deck — turns the free-text event into a Detroit-style choice.

Each card emits one canonical ``Event`` (text/impact/is_rumor) plus a
``base_shock`` seed for the price engine, and carries ``locks``/``unlocks`` that
cascade the *next* round's deck (a choice now closes/opens future cards).

Deck rule (one-round cascade):
    eligible(N) = {c | N in c.rounds}  −  last_pick.locks  +  last_pick.unlocks

Cards live in repo-root ``data/cards.json`` (see docs/branch_design.md §1, §13).
This module depends ONLY on sim.models + stdlib.
"""

from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from .models import EventImpact

_CARDS_PATH = Path(__file__).resolve().parents[2] / "data" / "cards.json"


class Card(BaseModel):
    id: str
    title: str
    text: str
    impact: EventImpact = EventImpact.NEUTRAL
    is_rumor: bool = False
    base_shock: float = 0.0
    rounds: list[int] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    locks: list[str] = Field(default_factory=list)
    unlocks: list[str] = Field(default_factory=list)


@lru_cache(maxsize=1)
def load_cards() -> list[Card]:
    raw = json.loads(_CARDS_PATH.read_text(encoding="utf-8"))
    return [Card(**c) for c in raw]


def cards_by_id() -> dict[str, Card]:
    return {c.id: c for c in load_cards()}


def get_card(card_id: str | None) -> Card | None:
    if not card_id:
        return None
    return cards_by_id().get(card_id)


def locked_cards(last_card_id: str | None) -> list[Card]:
    """Cards the previous pick closed off (shown greyed in the UI as 'locked')."""
    last = get_card(last_card_id)
    if not last:
        return []
    by_id = cards_by_id()
    return [by_id[cid] for cid in last.locks if cid in by_id]


def eligible_cards(round: int, last_card_id: str | None) -> list[Card]:
    """Cards available in ``round`` after applying the previous pick's cascade."""
    deck = load_cards()
    eligible = {c.id for c in deck if round in c.rounds}
    last = get_card(last_card_id)
    if last:
        eligible -= set(last.locks)
        eligible |= set(last.unlocks)
    return [c for c in deck if c.id in eligible]  # preserve deck order


def choose_round_cards(
    round: int, last_card_id: str | None, k: int = 3, seed: int = 0
) -> list[Card]:
    """Pick up to ``k`` cards for the round, always surfacing unlocked payoffs.

    Deterministic for a given (seed, round, last pick) so the deck is stable
    across re-polls within a round.
    """
    elig = eligible_cards(round, last_card_id)
    last = get_card(last_card_id)
    forced_ids = set(last.unlocks) if last else set()
    forced = [c for c in elig if c.id in forced_ids]
    rest = [c for c in elig if c.id not in forced_ids]
    rng = random.Random(seed + round * 7919)
    rng.shuffle(rest)
    picked = forced + rest
    picked = picked[: max(k, len(forced))]
    order = {c.id: i for i, c in enumerate(load_cards())}
    return sorted(picked, key=lambda c: order[c.id])  # stable UI order
