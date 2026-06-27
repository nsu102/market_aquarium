"""Load the frozen asset universe (default_assets.json) into Asset models.

default_assets.json is produced by listup.py (Upbit initial prices + Korean
names) and lives at the repo root. Per PRD: initial price from real Upbit (1
fetch, then fixed); no live price API.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .models import Asset

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSETS_PATH = REPO_ROOT / "default_assets.json"


@lru_cache(maxsize=4)
def _load_raw(path_str: str) -> dict:
    with open(path_str, encoding="utf-8") as f:
        return json.load(f)


def load_assets(path: Path | None = None, limit: int | None = None) -> list[Asset]:
    """Return assets from default_assets.json as Asset models (with seeded history)."""
    raw = _load_raw(str(path or DEFAULT_ASSETS_PATH))
    out: list[Asset] = []
    for a in raw.get("assets", []):
        price = float(a.get("price") or 0.0)
        out.append(
            Asset(
                symbol=a["symbol"],
                name=a.get("name", a["symbol"]),
                price=price,
                change24h=float(a.get("change24h") or 0.0),
                volume=float(a.get("volume") or 0.0),
                priceHistory=[price],
                sector=a.get("sector", ""),
            )
        )
    if limit is not None:
        out = out[:limit]
    return out


def load_sectors(path: Path | None = None) -> list[str]:
    raw = _load_raw(str(path or DEFAULT_ASSETS_PATH))
    return list(raw.get("sectors", []))


def assets_by_symbol(assets: list[Asset]) -> dict[str, Asset]:
    return {a.symbol: a for a in assets}
