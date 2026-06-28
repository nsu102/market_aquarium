"""Load the frozen asset universe (default_assets.json) into Asset models.

default_assets.json is produced by listup.py (Upbit initial prices + Korean
names) and lives at the repo root. Per PRD: initial price from real Upbit (1
fetch, then fixed); no live price API.
"""

from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path

from .models import Asset

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSETS_PATH = REPO_ROOT / "default_assets.json"


@lru_cache(maxsize=4)
def _load_raw(path_str: str) -> dict:
    with open(path_str, encoding="utf-8") as f:
        return json.load(f)


def _get_raw(path: Path | None = None) -> dict:
    """Load from MongoDB."""
    if path is not None:
        return _load_raw(str(path))
    from backend.db import _db
    doc = _db().default_assets.find_one({"_id": "current"})
    if not doc:
        raise RuntimeError("default_assets not found in MongoDB — run: python -m backend.seed")
    doc.pop("_id", None)
    return doc


def _synth_history(current_price: float, symbol: str, n: int = 20) -> list[float]:
    """Generate n synthetic past prices ending at current_price.

    Uses a seeded random walk backwards so the sparkline is deterministic
    per symbol and looks like a plausible recent trend.
    """
    # ponytail: seeded per-symbol so restarts produce the same sparkline
    rng = random.Random(hash(symbol) & 0xFFFF_FFFF)
    # Walk backward from current price with ~1-3% steps
    pts = [current_price]
    p = current_price
    for _ in range(n - 1):
        step = rng.gauss(0, 0.015) * p
        p = max(p - step, current_price * 0.5)
        pts.append(round(p, 2))
    pts.reverse()
    return pts


def load_assets(path: Path | None = None, limit: int | None = None) -> list[Asset]:
    """Return assets as Asset models. Reads from MongoDB first, file fallback."""
    raw = _get_raw(path)
    out: list[Asset] = []
    for a in raw.get("assets", []):
        price = float(a.get("price") or 0.0)
        history = _synth_history(price, a.get("symbol", ""), 20)
        out.append(
            Asset(
                symbol=a["symbol"],
                name=a.get("name", a["symbol"]),
                price=price,
                change24h=float(a.get("change24h") or 0.0),
                volume=float(a.get("volume") or 0.0),
                priceHistory=history,
                sector=a.get("sector", ""),
            )
        )
    if limit is not None:
        out = out[:limit]
    return out


def load_sectors(path: Path | None = None) -> list[str]:
    raw = _get_raw(path)
    return list(raw.get("sectors", []))


def assets_by_symbol(assets: list[Asset]) -> dict[str, Asset]:
    return {a.symbol: a for a in assets}
