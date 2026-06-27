"""Generate a forkable reverie sim folder for the 6 market personas.

Strategy (lowest-risk): reuse 6 real `base_the_ville_n25` characters whose
sprites/atlases and spatial memory already exist, and only PATCH their
scratch.json personality fields with our market persona text (from sim.personas).
This guarantees groundability (their spatial memory already contains Hobbs Cafe
and The Willows Market) and that the Phaser atlases render.

Output: environment/frontend_server/storage/base_the_ville_market6/

Run:  cd backend && python tools/gen_persona_sim.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

# make `sim` importable when run from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sim.personas import DEFAULT_PERSONA_IDS, get_persona  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
STORAGE = REPO / "environment" / "frontend_server" / "storage"
BASE = STORAGE / "base_the_ville_n25"
OUT = STORAGE / "base_the_ville_market6"

# market persona_id -> real the_ville character name (sprite/atlas + spatial mem exist).
# Matches frontend/constants/agentProfiles.ts sprite mapping.
PERSONA_TO_CHARACTER = {
    "panic": "Jane Moreno",
    "fomo": "Eddy Lin",
    "value": "Klaus Mueller",
    "quant": "Rajiv Patel",
    "whale": "Arthur Burton",
    "contrarian": "Wolfgang Schulz",
}

SEC_PER_STEP = 72  # locked decision #6
START_DATE = "February 13, 2023"
# Day starts at 00:00 (locked decision #6): 1 round = 1 calendar day, re-planning
# only at midnight, schedule injection always future. The early sleep stretch is
# meant to be fast-forwarded on screen, not avoided by shifting the start hour.
CURR_TIME = "February 13, 2023, 00:00:00"


def _latest_env_file(sim_dir: Path) -> Path:
    env_dir = sim_dir / "environment"
    files = sorted(env_dir.glob("*.json"), key=lambda p: int(p.stem))
    if not files:
        raise FileNotFoundError(f"no environment/*.json in {sim_dir}")
    return files[0]  # the lowest-step env has the bootstrap spawn tiles


def main() -> None:
    if not BASE.exists():
        raise SystemExit(f"base sim not found: {BASE}")
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "reverie").mkdir(parents=True)
    (OUT / "environment").mkdir(parents=True)
    (OUT / "personas").mkdir(parents=True)

    base_env = json.loads(_latest_env_file(BASE).read_text(encoding="utf-8"))
    new_env: dict[str, dict] = {}
    names: list[str] = []

    for pid in DEFAULT_PERSONA_IDS:
        char = PERSONA_TO_CHARACTER[pid]
        persona = get_persona(pid)
        src = BASE / "personas" / char
        dst = OUT / "personas" / char
        if not src.exists():
            raise SystemExit(f"base character missing: {src}")
        shutil.copytree(src, dst)

        # patch scratch personality with our market persona text
        scratch_path = dst / "bootstrap_memory" / "scratch.json"
        scratch = json.loads(scratch_path.read_text(encoding="utf-8"))
        scratch["innate"] = persona.innate
        scratch["learned"] = persona.learned
        scratch["currently"] = persona.currently
        scratch["lifestyle"] = persona.lifestyle
        scratch["daily_plan_req"] = persona.daily_req
        # reset per-run action/schedule state so the fork starts clean
        scratch["curr_time"] = None
        scratch["curr_tile"] = None
        scratch["daily_req"] = []
        scratch["f_daily_schedule"] = []
        scratch["f_daily_schedule_hourly_org"] = []
        scratch_path.write_text(json.dumps(scratch, indent=2, ensure_ascii=False), encoding="utf-8")

        names.append(char)
        if char in base_env:
            new_env[char] = base_env[char]
        else:
            # fallback spawn near the common plaza if the base env lacks this name
            new_env[char] = {"maze": "the_ville", "x": 60, "y": 60}

    # environment/0.json
    (OUT / "environment" / "0.json").write_text(
        json.dumps(new_env, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # reverie/meta.json
    meta = {
        "fork_sim_code": "base_the_ville_n25",
        "start_date": START_DATE,
        "curr_time": CURR_TIME,
        "sec_per_step": SEC_PER_STEP,
        "maze_name": "the_ville",
        "persona_names": names,
        "step": 0,
    }
    (OUT / "reverie" / "meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"generated {OUT}")
    print(f"  personas: {names}")
    print(f"  sec_per_step={SEC_PER_STEP}, curr_time={CURR_TIME}")


if __name__ == "__main__":
    main()
