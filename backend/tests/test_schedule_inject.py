import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "reverie" / "backend_server"))

from persona.cognitive_modules.schedule_inject import (  # noqa: E402
    schedule_total,
    index_at_minute,
    inject_activity,
    inject_board_then_exchange,
    find_activity_index,
)


def base_schedule():
    # Realistic full-day schedule, sums to 1440.
    return [
        ["sleeping", 360],
        ["morning routine", 120],
        ["working", 480],
        ["lunch", 60],
        ["working", 360],
        ["sleeping", 60],
    ]


def cumulative_start(schedule, index):
    return sum(d for _, d in schedule[:index])


def test_total_preserved_after_inject():
    sched = base_schedule()
    assert schedule_total(sched) == 1440
    out = inject_activity(sched, "new task", 30, 360)
    assert schedule_total(out) == 1440


def test_inject_is_shrink_not_append():
    sched = base_schedule()
    # not_before_minute=360 is exactly a slot boundary -> no split occurs.
    out = inject_activity(sched, "new task", 30, 360)
    # Borrowed from future ("morning routine" 120 -> 90), inserted one slot.
    assert len(out) == len(sched) + 1
    assert schedule_total(out) == schedule_total(sched)
    # Prove it borrowed, not appended on top: the following slot shrank.
    idx = find_activity_index(out, "new task")
    assert out[idx + 1] == ["morning routine", 90]
    # Input must be untouched (purity).
    assert sched == base_schedule()


def test_no_injection_into_past():
    sched = base_schedule()
    out = inject_activity(sched, "new task", 30, 600)
    # Slots fully before minute 600 are untouched.
    assert out[0] == ["sleeping", 360]
    assert out[1] == ["morning routine", 120]
    # New activity starts at/after minute 600.
    idx = find_activity_index(out, "new task")
    assert cumulative_start(out, idx) >= 600
    assert schedule_total(out) == 1440


def test_board_before_exchange():
    sched = base_schedule()
    out = inject_board_then_exchange(sched, now_minute=600)
    bi = find_activity_index(out, "checking the SNS board for market news")
    ei = find_activity_index(out, "going to the exchange to trade")
    assert bi is not None and ei is not None
    assert bi < ei
    assert cumulative_start(out, bi) < cumulative_start(out, ei)
    # Both at/after now_minute.
    assert cumulative_start(out, bi) >= 600


def test_both_injected_and_total_preserved():
    sched = base_schedule()
    out = inject_board_then_exchange(sched, now_minute=480)
    assert find_activity_index(out, "checking the SNS board for market news") is not None
    assert find_activity_index(out, "going to the exchange to trade") is not None
    assert schedule_total(out) == schedule_total(sched)


def test_index_at_minute_matches_cumulative():
    sched = base_schedule()
    # Cumulative ends: 360, 480, 960, 1020, 1380, 1440.
    assert index_at_minute(sched, 0) == 0      # sleeping (0-360)
    assert index_at_minute(sched, 359) == 0
    assert index_at_minute(sched, 360) == 1    # morning routine (360-480)
    assert index_at_minute(sched, 600) == 2    # working (480-960)
    assert index_at_minute(sched, 960) == 3    # lunch (960-1020)
    assert index_at_minute(sched, 1439) == 5   # final sleeping (1380-1440)
    # At/beyond total -> len, matching reverie clamp.
    assert index_at_minute(sched, 1440) == len(sched)


def test_inject_caps_when_insufficient_future_time():
    sched = base_schedule()
    # Only 60 minutes of future free time remain at minute 1380; ask for 120.
    out = inject_activity(sched, "late task", 120, 1380)
    assert schedule_total(out) == 1440  # total never overflows
    idx = find_activity_index(out, "late task")
    assert out[idx][1] == 60  # borrowing capped to available future time


def test_idempotent_ish():
    sched = base_schedule()
    once = inject_board_then_exchange(sched, now_minute=480)
    # Re-inject on a schedule that already contains both activities.
    twice = inject_board_then_exchange(once, now_minute=480)
    # Behaviour: re-injects (may duplicate) but the total stays invariant.
    assert schedule_total(twice) == schedule_total(sched) == 1440
