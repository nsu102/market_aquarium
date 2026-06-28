"""JSON file-based game state persistence."""

import json
from pathlib import Path
from models import GameState

SAVE_DIR = Path(__file__).parent / "saves"
SAVE_DIR.mkdir(exist_ok=True)


def _path(game_id: str) -> Path:
    return SAVE_DIR / f"{game_id}.json"


def save_game(game: GameState) -> None:
    _path(game.gameId).write_text(
        json.dumps(game.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_game(game_id: str) -> GameState | None:
    p = _path(game_id)
    if not p.exists():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    return GameState(**data)


def list_games() -> list[str]:
    return [p.stem for p in SAVE_DIR.glob("*.json")]
