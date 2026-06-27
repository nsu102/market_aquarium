"""Tests for the FR-10 reports + FR-9 achievements (sim/report.py)."""

from __future__ import annotations

from sim.models import (
    Agent,
    MarketData,
    PortfolioHolding,
    PriceBreakdown,
)
from sim.report import (
    award_achievements,
    build_overall_report,
    build_round_report,
    emotion_contribution_share,
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _market(fg: float = 62.0, panic: float = 0.3, fomo: float = 0.4) -> MarketData:
    return MarketData(fearGreedIndex=fg, panicSellRatio=panic, fomoBuyRatio=fomo)


def _breakdown(
    symbol: str = "BTC",
    event: float = 0.0,
    order: float = 0.0,
    emotion: float = 0.0,
    noise: float = 0.0,
) -> PriceBreakdown:
    total = event + order + emotion + noise
    return PriceBreakdown(
        symbol=symbol,
        event_impact=event,
        order_pressure=order,
        emotion_overheat=emotion,
        noise=noise,
        total_pct=total,
        old_price=100.0,
        new_price=100.0 * (1 + total / 100.0),
    )


def _agent(
    agent_id: str,
    type: str = "quant",
    cash: float = 1000.0,
    portfolio: list[PortfolioHolding] | None = None,
) -> Agent:
    return Agent(
        id=agent_id,
        alias=agent_id,
        type=type,
        sprite="s",
        cash=cash,
        portfolio=portfolio or [],
    )


def _has_emoji(text: str) -> bool:
    return any(ord(ch) > 0x1F000 for ch in text)


# --------------------------------------------------------------------------- #
# Round report
# --------------------------------------------------------------------------- #
def test_round_report_has_fear_greed_indices():
    market = _market(fg=71.0, panic=0.25, fomo=0.5)
    report = build_round_report(1, market, [_breakdown(emotion=2.0)], [], [])
    assert report.fearGreedIndex == 71.0
    assert report.panicSellRatio == 0.25
    assert report.fomoBuyRatio == 0.5
    assert report.round == 1


def test_emotion_contribution_share_computed():
    # Dominated by emotion -> share close to 1.
    emo_heavy = [_breakdown(emotion=10.0, event=0.1, order=0.1, noise=0.1)]
    high = build_round_report(1, _market(), emo_heavy, [], [])
    assert high.emotion_contribution_share > 0.9

    # Dominated by event impact -> share low.
    event_heavy = [_breakdown(event=10.0, emotion=0.1, order=0.1, noise=0.1)]
    low = build_round_report(1, _market(), event_heavy, [], [])
    assert low.emotion_contribution_share < 0.1


def test_emotion_share_in_unit_interval():
    # Mixed signs, multiple breakdowns -> still bounded.
    mixed = [
        _breakdown(event=-5.0, order=3.0, emotion=-2.0, noise=1.0),
        _breakdown(symbol="ETH", event=4.0, order=-1.0, emotion=6.0, noise=-2.0),
    ]
    share = emotion_contribution_share(mixed)
    assert 0.0 <= share <= 1.0

    # Zero breakdowns -> 0.0 (no division by zero).
    assert emotion_contribution_share([]) == 0.0

    # All-zero components -> 0.0.
    assert emotion_contribution_share([_breakdown()]) == 0.0


def test_round_report_markdown_nonempty_no_emoji():
    report = build_round_report(
        3,
        _market(),
        [_breakdown(emotion=2.0, event=1.0)],
        [_agent("a")],
        [],
    )
    assert report.markdown.strip()
    assert "3" in report.markdown  # round number present
    assert not _has_emoji(report.markdown)


# --------------------------------------------------------------------------- #
# Achievements
# --------------------------------------------------------------------------- #
def test_achievement_awarded_on_end():
    agents = [_agent("a", cash=5000.0), _agent("b", cash=1000.0)]
    achievements = award_achievements(agents)
    assert len(achievements) >= 1
    # No achievements for an empty roster.
    assert award_achievements([]) == []


def test_best_performer_achievement():
    # b grows the most in net worth.
    a = _agent("a", cash=1100.0)
    b = _agent("b", cash=3000.0)
    agents = [a, b]
    initial_state = {
        "a": {"cash": 1000.0, "net_worth": 1000.0},
        "b": {"cash": 1000.0, "net_worth": 1000.0},
    }
    achievements = award_achievements(agents, initial_state)
    best = [ach for ach in achievements if ach.title == "최고 수익률"]
    assert len(best) == 1
    assert best[0].agent_id == "b"


def test_panic_seller_completion_achievement():
    panic = _agent("p", type="panic_seller", cash=200.0, portfolio=[])
    achievements = award_achievements([panic])
    assert any(ach.title == "패닉셀 완주" for ach in achievements)


# --------------------------------------------------------------------------- #
# Overall report
# --------------------------------------------------------------------------- #
def test_overall_report_generated():
    market = _market()
    r1 = build_round_report(1, market, [_breakdown(emotion=1.0, event=9.0)], [], [])
    r2 = build_round_report(2, market, [_breakdown(emotion=9.0, event=1.0)], [], [])
    agents = [_agent("a", cash=5000.0)]
    achievements = award_achievements(agents)

    overall = build_overall_report([r1, r2], agents, achievements)
    assert overall.markdown.strip()
    assert len(overall.rounds) == 2
    # Achievements are listed in the markdown.
    for ach in achievements:
        assert ach.title in overall.markdown
    assert not _has_emoji(overall.markdown)
