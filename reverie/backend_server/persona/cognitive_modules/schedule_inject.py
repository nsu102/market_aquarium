"""
schedule_inject.py

PURE daily-schedule injection helpers for the Market Aquarium reverie
integration. Stdlib only -- no reverie imports, no network, no Persona object.

A "schedule" here is exactly what reverie stores in
``scratch.f_daily_schedule``: a list of ``[activity_str, duration_minutes]``
pairs whose durations sum to a full day (1440 minutes). The day starts at
00:00, so "minute" always means minutes elapsed since 00:00.

The goal of these helpers is to guarantee that, on any given day, a persona
performs a "check the SNS board" activity strictly BEFORE a "go to the
exchange / trade" activity -- while:

  * preserving the total-minute invariant (the sum never changes), and
  * never rewriting slots that lie entirely in the past (only future free
    time is borrowed).

All functions are pure: they never mutate their input and always return a new
list.
"""

from __future__ import annotations


def schedule_total(schedule):
    """Return the sum of all slot durations in ``schedule``."""
    total = 0
    for _activity, duration in schedule:
        total += duration
    return total


def index_at_minute(schedule, minute):
    """
    Replicate reverie's ``Scratch.get_f_daily_schedule_index``.

    Walk the cumulative durations and return the index of the first slot whose
    cumulative END exceeds ``minute``. If ``minute`` is at or beyond the total
    duration, no slot's end exceeds it, so we fall through and return
    ``len(schedule)`` -- exactly as reverie does (curr_index ends at len).
    """
    curr_index = 0
    elapsed = 0
    for _task, duration in schedule:
        elapsed += duration
        if elapsed > minute:
            return curr_index
        curr_index += 1
    return curr_index


def find_activity_index(schedule, needle):
    """
    Return the index of the first slot whose activity text contains ``needle``
    (case-insensitive). Return ``None`` if no slot matches.
    """
    if needle is None:
        return None
    target = needle.lower()
    for i, (activity, _duration) in enumerate(schedule):
        if target in str(activity).lower():
            return i
    return None


def inject_activity(schedule, activity, duration, not_before_minute):
    """
    Insert ``[activity, duration]`` at the earliest slot boundary at/after
    ``not_before_minute`` by SHRINKING following (future) free time, so the
    schedule total is unchanged.

    Algorithm:
      1. Copy the schedule (pure -- never mutate the input).
      2. Find the slot covering ``not_before_minute``. If that minute falls in
         the middle of a slot, split the slot there so the kept first part stays
         in the past and the new activity can start exactly at
         ``not_before_minute``; the boundary becomes the insertion point.
      3. Borrow ``duration`` minutes from the slots at/after the insertion
         point, reducing their durations in order and dropping any slot that
         reaches 0. Past slots are never touched.
      4. Insert ``[activity, borrowed]`` at the boundary.

    Capping: if the future free time after ``not_before_minute`` is less than
    ``duration``, we borrow only what is available; the injected activity gets
    that smaller duration. This guarantees the total is ALWAYS preserved (we
    add exactly as many minutes as we removed) -- the total never overflows.
    """
    # Pure: work on a deep-ish copy of the [activity, duration] pairs.
    result = [[a, d] for a, d in schedule]

    if duration <= 0:
        return result

    nb = not_before_minute if not_before_minute > 0 else 0

    # Locate the slot covering nb and determine the insertion boundary index.
    insert_idx = len(result)  # default: nb is at/after the end of the day
    cum = 0
    for i in range(len(result)):
        act, dur = result[i]
        start = cum
        end = cum + dur
        if start <= nb < end:
            off = nb - start
            if off > 0:
                # Split: keep [start, nb) in the past, expose [nb, end) as
                # borrowable future free time.
                result[i] = [act, off]
                result.insert(i + 1, [act, dur - off])
                insert_idx = i + 1
            else:
                # nb is exactly on this slot's start boundary.
                insert_idx = i
            break
        cum = end

    # Borrow `duration` minutes from slots at/after the insertion boundary.
    borrowed = 0
    j = insert_idx
    while j < len(result) and borrowed < duration:
        need = duration - borrowed
        avail = result[j][1]
        take = need if need < avail else avail
        result[j][1] -= take
        borrowed += take
        if result[j][1] == 0:
            result.pop(j)  # drop emptied slot; do not advance j
        else:
            j += 1

    # Insert the new activity with whatever we managed to borrow (cap-safe).
    result.insert(insert_idx, [activity, borrowed])
    return result


def inject_board_then_exchange(
    schedule,
    now_minute,
    board_activity="checking the SNS board for market news",
    board_dur=30,
    exchange_activity="going to the exchange to trade",
    exchange_dur=30,
):
    """
    Inject BOTH a "check the SNS board" activity and a "go to the exchange /
    trade" activity, guaranteeing:

      * both start at/after ``now_minute``,
      * the board slot's start minute is strictly BEFORE the exchange slot's
        start minute, and
      * the original total is preserved.

    Strategy: inject the board first at ``now_minute``. Then compute the board
    slot's end minute and inject the exchange with ``not_before_minute`` set to
    that end, so the exchange can only land after the board.

    Idempotence note: this function does NOT skip when matching activities
    already exist -- it re-injects, which may create duplicate slots. That is
    acceptable for the MVP because each injection is total-preserving, so
    repeated calls never corrupt the 1440-minute invariant.
    """
    # 1) Inject the board at now_minute.
    result = inject_activity(schedule, board_activity, board_dur, now_minute)

    # 2) Find where the board actually landed and where it ends.
    bi = find_activity_index(result, board_activity)
    if bi is None:
        # Nothing was injected (e.g. board_dur <= 0); still inject exchange.
        return inject_activity(result, exchange_activity, exchange_dur, now_minute)

    board_start = 0
    for k in range(bi):
        board_start += result[k][1]
    board_actual_dur = result[bi][1]

    # 3) Inject the exchange no earlier than the board's end so its start is
    #    strictly after the board's start (assuming board borrowed > 0 minutes).
    exch_not_before = board_start + board_actual_dur
    result = inject_activity(
        result, exchange_activity, exchange_dur, exch_not_before
    )
    return result
