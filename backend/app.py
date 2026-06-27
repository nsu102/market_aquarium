"""FastAPI surface for the Market Aquarium game (the frontend talks to this).

Run from the backend/ directory:
    uvicorn app:app --reload --port 8100

A single global GameSession is kept (one game at a time), mirroring the
control_server pattern. Response shapes mirror the frontend mock_data types so
the UI can swap mock for these endpoints with minimal churn.

This is the market-logic API. It is separate from:
  - api_server (port 8000): reverie movement/persona JSON for the Phaser viewer.
  - control_server (port 8001): drives the reverie engine.
The reverie integration (movement-driven rounds) is a later phase.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sim.assets import load_assets, load_sectors
from sim.engine import MAX_ROUNDS, GameSession

app = FastAPI(title="Market Aquarium API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single global session (one game at a time).
_session: GameSession | None = None


class StartBody(BaseModel):
    num_agents: int = 6
    seed: int = 42


class EventBody(BaseModel):
    text: str
    source: str = "user"
    is_rumor: bool = False
    cred_source: str | None = None


def _require_session() -> GameSession:
    if _session is None:
        raise HTTPException(status_code=400, detail="no game in progress; POST /api/game/start first")
    return _session


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "max_rounds": MAX_ROUNDS, "game_active": _session is not None}


@app.get("/api/assets")
def assets() -> dict:
    return {
        "assets": [a.model_dump() for a in load_assets()],
        "sectors": load_sectors(),
    }


@app.post("/api/game/start")
def start(body: StartBody) -> dict:
    """Begin a new game: sample agents + load assets. Returns initial state."""
    global _session
    _session = GameSession(num_agents=body.num_agents, seed=body.seed)
    return _session.state()


@app.get("/api/game/state")
def state() -> dict:
    return _require_session().state()


@app.post("/api/game/event")
def submit_event(body: EventBody) -> dict:
    """FR-1: submit the round's single event, run the round, return new state + report."""
    s = _require_session()
    if s.finished:
        raise HTTPException(status_code=400, detail="simulation already finished (5 rounds)")
    rr = s.run_round(
        body.text, source=body.source, is_rumor=body.is_rumor, cred_source=body.cred_source
    )
    out = s.state()
    out["round_report"] = rr.model_dump()
    out["round_actions"] = s.last_round_actions  # per-agent: posted? traded? (for movement)
    return out


@app.get("/api/game/report")
def report() -> dict:
    """FR-9/FR-10: overall report + achievements (available any time, final after 5 rounds)."""
    s = _require_session()
    return s.overall_report().model_dump()
