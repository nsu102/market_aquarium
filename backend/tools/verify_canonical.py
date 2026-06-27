"""Headless live run of the canonical reverie<->market integration (no API key).

It mocks `openai` at the source so reverie's own cognition runs offline/instantly
(validators fall back to defaults), then drives ONE real persona across the
the_ville map and shows the canonical flow firing:

  injected schedule (board before exchange) -> persona walks to Hobbs Cafe ->
  on arrival view_sns (post appears) -> walks to The Willows Market -> on arrival
  trade -> end of round price distortion + report.

Run:  cd reverie/backend_server && python ../../backend/tools/verify_canonical.py
(must run with cwd = reverie/backend_server for the engine's relative imports)
"""

from __future__ import annotations

import datetime
import json
import os
import sys
from pathlib import Path

# The reverie engine uses imports + relative paths rooted at backend_server.
_BS = Path(__file__).resolve().parents[2] / "reverie" / "backend_server"
sys.path.insert(0, str(_BS))
os.chdir(_BS)

import utils  # noqa: E402
utils.debug = False  # silence the engine's prompt dump

# --- mock openai at the source: instant, offline, deterministic fallbacks ---
import openai  # noqa: E402


def _fake_chat(*args, **kwargs):
    return {"choices": [{"message": {"content": ""}}]}


def _fake_embed(*args, **kwargs):
    return {"data": [{"embedding": [0.0] * 8}]}


openai.ChatCompletion.create = _fake_chat  # type: ignore
openai.Embedding.create = _fake_embed  # type: ignore

# engine imports (cwd must be reverie/backend_server)
from maze import Maze  # noqa: E402
from persona.persona import Persona  # noqa: E402
from persona.cognitive_modules import plan as _plan  # noqa: E402
from persona.cognitive_modules import perceive as _perceive  # noqa: E402
import market_bridge as mb  # noqa: E402

# reverie's own LLM parsers require REAL model text (they return None on empty
# output). For a key-less headless proof we stub the engine's generators with
# canned valid values so cognition runs offline. With a real OPENROUTER_API_KEY
# you would NOT stub these -- the engine runs them for real.
_plan.generate_wake_up_hour = lambda persona: 6
_plan.generate_first_daily_plan = lambda persona, wake: ["wake up", "watch the markets", "rest"]
_plan.generate_hourly_schedule = lambda persona, wake: [
    ["sleeping", 360], ["morning routine", 120], ["watching the markets", 480],
    ["lunch", 60], ["watching the markets", 360], ["sleeping", 60]]
_plan.generate_action_sector = lambda *a: "Hobbs Cafe"
_plan.generate_action_arena = lambda *a: "cafe"
_plan.generate_action_game_object = lambda *a: "cafe customer seating"
_plan.generate_action_pronunciatio = lambda *a: "."
_plan.generate_action_event_triple = lambda act, persona: (persona.scratch.name, "is", "active")
_plan.generate_act_obj_desc = lambda obj, act, persona: "in use"
_plan.generate_act_obj_event_triple = lambda obj, desc, persona: (obj, "is", "used")
_plan.generate_task_decomp = lambda persona, desc, dur: [[desc, dur]]
_perceive.generate_poig_score = lambda persona, etype, desc: 3

REPO = Path(__file__).resolve().parents[2]
SIM = REPO / "environment" / "frontend_server" / "storage" / "base_the_ville_market6"
NAME = "Jane Moreno"


def main() -> None:
    maze = Maze("the_ville")
    env0 = json.loads((SIM / "environment" / "0.json").read_text(encoding="utf-8"))
    start = env0[NAME]
    tile = (start["x"], start["y"])

    persona = Persona(NAME, str(SIM / "personas" / NAME))
    persona.reflect = lambda: None  # skip reflection (LLM) for the offline proof
    ctx = mb.init_context([NAME])
    ctx.set_event("대형 거래소 해킹 루머가 퍼졌다", is_rumor=True, timestamp="Day1 06:00")

    curr_time = datetime.datetime(2023, 2, 13, 6, 0, 0)
    personas = {NAME: persona}

    print(f"start tile={tile}  posts={len(ctx.posts)}  event set")
    schedule_logged = False
    board_seen = exchange_seen = False

    for step in range(900):
        next_tile, pron, desc = persona.move(maze, personas, tile, curr_time)
        tile = next_tile

        if not schedule_logged and persona.scratch.f_daily_schedule:
            acts = [a for a, _ in persona.scratch.f_daily_schedule]
            has_board = any("board" in a.lower() for a in acts)
            has_exch = any("exchange" in a.lower() for a in acts)
            print(f"  schedule injected: board={has_board} exchange={has_exch} "
                  f"(slots={len(acts)}, sum={sum(d for _, d in persona.scratch.f_daily_schedule)})")
            schedule_logged = True

        addr = persona.scratch.act_address or ""
        if "Hobbs Cafe" in addr and not board_seen:
            print(f"  step {step} {curr_time.strftime('%H:%M')} -> heading to BOARD ({addr})")
        if "Willows Market" in addr and not exchange_seen:
            print(f"  step {step} {curr_time.strftime('%H:%M')} -> heading to EXCHANGE ({addr})")

        if NAME in ctx._sns_done and not board_seen:
            board_seen = True
            post = next((p for p in ctx.posts if p.agentId == persona.scratch.name.lower()
                         or p.agentAlias == ctx.agents[NAME].alias), None)
            print(f"  ARRIVED BOARD @ step {step}: view_sns fired, posts now={len(ctx.posts)}")
            print(f"     fear={ctx.agents[NAME].fear:.0f} greed={ctx.agents[NAME].greed:.0f}")
        if NAME in ctx._trade_done and not exchange_seen:
            exchange_seen = True
            tr = ctx._round_trades[-1] if ctx._round_trades else None
            print(f"  ARRIVED EXCHANGE @ step {step}: trade fired -> {tr.action.value if tr else '?'} "
                  f"cash={ctx.agents[NAME].cash:.0f}")

        curr_time += datetime.timedelta(seconds=72)
        if board_seen and exchange_seen:
            break

    rr = ctx.end_round()
    print(f"\nend_round: fearGreedIndex={ctx.market.fearGreedIndex:.1f} "
          f"emotion_share={rr.emotion_contribution_share:.2f}")
    print(f"board_seen={board_seen} exchange_seen={exchange_seen}")
    print("report (first 3 lines):")
    for line in rr.markdown.splitlines()[:3]:
        print("   ", line)


if __name__ == "__main__":
    main()
