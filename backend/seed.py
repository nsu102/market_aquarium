"""Seed MongoDB with personas, allocations, universe, and default_assets.

Usage:
    python -m backend.seed          # from repo root
    python seed.py                  # from backend/

Idempotent: drops and re-inserts each collection on every run.
"""

from __future__ import annotations

import json
import sys
from os.path import abspath, dirname, join, normpath

_HERE = dirname(abspath(__file__))
_REPO = normpath(join(_HERE, ".."))
sys.path.insert(0, _REPO)

from backend.db import _db  # noqa: E402


def _load_json(path: str) -> dict | list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def seed_personas(db):
    """Seed personas collection from the hardcoded pool in personas.py."""
    from backend.sim.personas import PERSONA_POOL

    docs = []
    for p in PERSONA_POOL:
        d = p.model_dump()
        d["_id"] = p.persona_id
        docs.append(d)

    db.personas.drop()
    db.personas.insert_many(docs)
    print(f"  personas: {len(docs)}건")


def seed_allocations(db):
    """Seed allocations collection from portfolio_allocations.json."""
    alloc_path = join(_HERE, "sim", "portfolio_allocations.json")
    raw = _load_json(alloc_path)

    docs = []
    for pid, spec in raw.items():
        if pid.startswith("_"):
            continue
        doc = dict(spec)
        doc["_id"] = pid
        docs.append(doc)

    db.allocations.drop()
    db.allocations.insert_many(docs)
    print(f"  allocations: {len(docs)}건")


def seed_universe(db):
    """Seed universe collection from universe.json."""
    uni_path = join(_REPO, "universe.json")
    raw = _load_json(uni_path)
    raw["_id"] = "current"

    db.universe.drop()
    db.universe.insert_one(raw)
    print(f"  universe: {raw.get('total', '?')}종목")


def seed_default_assets(db):
    """Seed default_assets collection from default_assets.json."""
    assets_path = join(_REPO, "default_assets.json")
    raw = _load_json(assets_path)
    raw["_id"] = "current"

    db.default_assets.drop()
    db.default_assets.insert_one(raw)
    print(f"  default_assets: {raw.get('count', '?')}종목")


def seed_all():
    db = _db()
    print(f"Seeding MongoDB: {db.client.address} / {db.name}")
    seed_personas(db)
    seed_allocations(db)
    seed_universe(db)
    seed_default_assets(db)
    print("Done.")


if __name__ == "__main__":
    seed_all()
