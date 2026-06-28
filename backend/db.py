"""MongoDB session store for per-user game data.

Each user gets a UUID session with their own default_assets snapshot + seed.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27018")
DB_NAME = os.environ.get("MONGO_DB", "market_aquarium")

_client: MongoClient | None = None


def _db():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    return _client[DB_NAME]


def create_session(default_assets: dict, seed: int | None = None) -> str:
    """Create a new session, store assets snapshot, return UUID."""
    uid = str(uuid.uuid4())
    if seed is None:
        seed = int.from_bytes(os.urandom(4), "big")
    _db().sessions.insert_one({
        "_id": uid,
        "seed": seed,
        "created_at": datetime.now(timezone.utc),
        "default_assets": default_assets,
        "game_state": None,
    })
    return uid


def get_session(uid: str) -> dict | None:
    return _db().sessions.find_one({"_id": uid})


def save_game_state(uid: str, state: dict):
    _db().sessions.update_one(
        {"_id": uid},
        {"$set": {"game_state": state, "updated_at": datetime.now(timezone.utc)}},
    )


def get_default_assets(uid: str) -> dict | None:
    doc = _db().sessions.find_one({"_id": uid}, {"default_assets": 1})
    return doc["default_assets"] if doc else None


def list_sessions(limit: int = 20) -> list[dict]:
    return list(
        _db().sessions.find({}, {"default_assets": 0, "game_state": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
