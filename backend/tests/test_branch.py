"""FR-Branch: deck cascade + ending gate resolution (deterministic, no LLM)."""

from __future__ import annotations

from sim import cards
from sim.branch import ArcTracker
from sim.models import Agent, PortfolioHolding


def _agent(agent_type: str) -> Agent:
    return Agent(
        id=f"id_{agent_type}", alias=agent_type, type=agent_type, sprite="",
        cash=0.0, portfolio=[PortfolioHolding(asset="X", amount=10, avgPrice=100)],
    )


# --------------------------------------------------------------------------- #
# Deck
# --------------------------------------------------------------------------- #
def test_deck_loads_17_cards():
    deck = cards.load_cards()
    assert len(deck) == 17
    assert len({c.id for c in deck}) == 17


def test_cascade_lock_and_unlock():
    # Choosing the hack rumour in R1 locks the denial and unlocks the leak for R2.
    elig = {c.id for c in cards.eligible_cards(2, "card_hack_rumor")}
    assert "card_authority_denial" not in elig   # locked
    assert "card_more_leak" in elig               # unlocked (rounds:[] otherwise)


def test_every_round_has_natural_cards():
    for r in range(1, 6):
        assert cards.eligible_cards(r, None), f"round {r} empty"


# --------------------------------------------------------------------------- #
# Ending gates  (prices drive networth mark-to-market)
# --------------------------------------------------------------------------- #
def _track(agent: Agent, steps: list[tuple[float, float, str]]):
    """steps = [(price, market_fg, lastAction), ...] -> resolved ending_id."""
    t = ArcTracker([agent], {"X": 100.0})  # base networth = 10 * 100 = 1000
    for i, (price, fg, action) in enumerate(steps, start=1):
        agent.lastAction = action
        agent.fear = fg_to_fear(fg, action)
        agent.greed = 100 - agent.fear
        t.update(i, [agent], fg, {"X": price})
    return t.endings([agent])[0]


def fg_to_fear(market_fg: float, action: str) -> float:
    # crude: fearful market -> high agent fear (only used by panic gate here)
    return 95.0 if market_fg <= 20 and action == "SELL" else 30.0


def test_panic_ruin_E1():
    a = _agent("panic_seller")
    e = _track(a, [(5.0, 15, "SELL")])  # networth 0.05, fear 95
    assert e.ending_id == "E1"


def test_whale_contrarian_win_W1():
    a = _agent("whale")
    e = _track(a, [(100.0, 20, "BUY_LARGE"), (140.0, 50, "HOLD")])  # bought in fear, +40%
    assert e.ending_id == "W1"


def test_whale_caught_at_top_W2():
    a = _agent("whale")
    e = _track(a, [(100.0, 80, "BUY_LARGE"), (80.0, 60, "HOLD")])  # bought in greed, -20%
    assert e.ending_id == "W2"


def test_fomo_wipeout_F1():
    a = _agent("fomo_trader")
    e = _track(a, [(100.0, 80, "BUY"), (60.0, 55, "HOLD")])  # bought in greed, -40%
    assert e.ending_id == "F1"


def test_ending_carries_mutation_and_alias():
    a = _agent("whale")
    e = _track(a, [(100.0, 20, "BUY_LARGE"), (140.0, 50, "HOLD")])
    assert e.agent_alias == "whale"
    assert e.persona_mutation  # W1 carries a cash_pool_scale mutation
