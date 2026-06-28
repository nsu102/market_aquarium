"""Market Aquarium LIVE server — self-built loop (reverie used only as map/path lib).

The game is driven by ``backend.sim.engine.GameSession`` (our workflow:
event -> emotion -> board posts -> trades -> price -> round report). reverie's
``Maze`` + ``path_finder`` are reused ONLY for tile pathfinding on the_ville; the
fragile reverie cognitive loop is NOT used.

Each round's result is choreographed into a per-step movement timeline that the
EXISTING Phaser frontend animates, using real the_ville places:

    home -> (daily-life spot) -> board(Hobbs Cafe) -> (daily-life spot)
         -> exchange(Willows Market) -> home

The board visit always precedes the exchange visit. The market effects (posts,
trades, emotion, prices) are computed once by run_round(); the timeline is pure
visual choreography on top.

Endpoints match what the frontend already calls. Run from backend/:
    cd backend && python -m uvicorn market_live_server:app --port 8000
"""

from __future__ import annotations

import json
import os
import random
import sys
from os.path import abspath, dirname, join, normpath

# Everything lives in backend/ now (no reverie folder). maze/path_finder/utils
# are the_ville map utilities kept alongside the game logic (backend.sim).
_HERE = dirname(abspath(__file__))            # backend/
_REPO = normpath(join(_HERE, ".."))           # repo root
sys.path.insert(0, _HERE)                     # maze / path_finder / utils (local)
sys.path.insert(0, _REPO)                     # backend.sim

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from maze import Maze  # noqa: E402  (the_ville map util)
from path_finder import path_finder  # noqa: E402  (path util)
from utils import collision_block_id  # noqa: E402  (config)

from backend.sim.engine import GameSession  # noqa: E402
from backend.sim.models import Asset  # noqa: E402

# ponytail: lazy import — listup is at repo root, imported at runtime only
sys.path.insert(0, _REPO)

# --------------------------------------------------------------------------- #
# the_ville location mapping (use existing places).
# --------------------------------------------------------------------------- #
BOARD_ADDR = "the Ville:Harvey Oak Supply Store:supply store:supply store counter"  # 게시판 (매매소2)
EXCHANGE_ADDR = "the Ville:The Willows Market and Pharmacy:store:grocery store counter"  # 거래소 (매매소1)

FORK_ENV0 = join(
    _REPO, "environment", "frontend_server", "storage",
    "base_the_ville_market6", "environment", "0.json",
)
ASSETS_DIR = join(_REPO, "environment", "frontend_server", "static_dirs", "assets")

TRADE_LABEL = {
    "BUY": "거래소에서 매수",
    "SELL": "거래소에서 매도",
    "BUY_LARGE": "거래소에서 대량매수",
    "HOLD": "거래소에서 관망",
}

# --------------------------------------------------------------------------- #
# App + shared state
# --------------------------------------------------------------------------- #
app = FastAPI(title="Market Aquarium Live")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:3300", "http://127.0.0.1:3300"],
    allow_methods=["*"], allow_headers=["*"],
)
if os.path.isdir(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

_MAZE: Maze | None = None


def _maze() -> Maze:
    global _MAZE
    if _MAZE is None:
        _MAZE = Maze("the_ville")
    return _MAZE


class Live:
    """Holds one live game: the engine session + the current movement timeline."""

    def __init__(self, sim_code: str, assets=None, seed: int = 42):
        self.sim_code = sim_code
        self.game = GameSession(assets=assets, seed=seed)
        self.homes = self._load_homes()  # original name -> (x, y)
        # engine agent -> reverie persona (original/underscore) via sprite filename
        self.persona = []  # list of {agent, original, underscore, initial, home}
        for ag in self.game.agents:
            under = os.path.splitext(os.path.basename(ag.sprite))[0] if ag.sprite else ""
            original = under.replace("_", " ")
            home = self.homes.get(original)
            if home is None:  # fallback: spread unknown agents near map centre
                home = (62 + len(self.persona) * 2, 70)
            self.persona.append({
                "agent": ag, "original": original, "underscore": under,
                "initial": (original[0] + original.split(" ")[-1][0]).upper() if original else "?",
                "home": home,
            })
        # timeline: list of frames; each frame = {original: (x, y, description)}.
        # The frontend's step counter increases monotonically across rounds, so
        # each round's timeline lives at an absolute offset (self.base) rather
        # than restarting at 0 (which would leave round 2+ unreachable).
        self.timeline: list[dict] = []
        self.base: int = 0           # absolute step where the current timeline starts
        self.last_poll_step: int = 0  # highest step the frontend has polled
        # Start/final snapshots so market + prices ramp across the day animation
        # (numbers change in sync with the movement, not all at once up front).
        self.start_market: dict | None = None
        self.final_market: dict | None = None
        self.start_prices: dict = {}
        self.final_prices: dict = {}

    @staticmethod
    def _load_homes() -> dict:
        try:
            with open(FORK_ENV0, encoding="utf-8") as f:
                raw = json.load(f)
            return {k: (v["x"], v["y"]) for k, v in raw.items()}
        except Exception:
            return {}

    # -- timeline building ------------------------------------------------- #
    def _tile_for(self, address: str):
        tiles = _maze().address_tiles.get(address)
        if not tiles:
            return None
        return sorted(tiles)[0]

    def _path(self, a, b):
        if a is None or b is None:
            return []
        try:
            p = path_finder(_maze().collision_maze, list(a), list(b), collision_block_id)
            return [(t[0], t[1]) for t in p]
        except Exception:
            return [a, b]

    def build_timeline(self):
        """Choreograph this round's actions into per-agent home->...->home paths."""
        # Start this round's timeline at the frontend's current step so it
        # continues seamlessly (the frontend never rewinds its step counter).
        self.base = self.last_poll_step
        # Absolute step at which each agent ARRIVES at the board/exchange this
        # round, so posts/trades reveal as agents arrive (not all up front).
        self.board_arrival: dict[str, int] = {}
        self.exchange_arrival: dict[str, int] = {}
        actions = {a["agent_id"]: a for a in self.game.last_round_actions}
        rng = random.Random(self.game.seed + self.game.round)
        board_t = self._tile_for(BOARD_ADDR)
        exch_t = self._tile_for(EXCHANGE_ADDR)

        per_agent_frames: dict[str, list] = {}
        for p in self.persona:
            ag = p["agent"]
            act = actions.get(ag.id, {})
            home = p["home"]
            # Per-agent RNG for staggered timing.
            arng = random.Random((hash(ag.id) & 0xFFFFFFFF) ^ (self.game.round * 2654435761))
            start_delay = arng.randint(0, 40)
            board_label = "게시판에 글 작성" if act.get("posted") else "게시판에서 분위기 확인"
            exch_label = TRADE_LABEL.get(act.get("trade_action", "HOLD"), "거래소에서 관망")

            # ponytail: simplified route — 집 → 게시판 → 거래소 → 집
            waypoints = [
                (home, "집에서 하루 계획"),
                (board_t or home, board_label),
                (exch_t or home, exch_label),
                (home, "집으로 귀가"),
            ]
            frames = [(home[0], home[1], "집에서 하루 계획") for _ in range(1 + start_delay)]
            for i in range(1, len(waypoints)):
                seg = self._path(waypoints[i - 1][0], waypoints[i][0])
                wx, wy = waypoints[i][0]
                label = waypoints[i][1]
                for t in seg[1:]:
                    frames.append((t[0], t[1], label))
                if i == 1:  # board
                    self.board_arrival[ag.id] = self.base + len(frames) - 1
                elif i == 2:  # exchange
                    self.exchange_arrival[ag.id] = self.base + len(frames) - 1
                for _ in range(arng.randint(6, 20)):
                    frames.append((wx, wy, label))
            per_agent_frames[p["original"]] = frames

        max_len = max((len(f) for f in per_agent_frames.values()), default=1)
        # pad everyone to the same number of steps (idle at home at the end)
        self.timeline = []
        for step in range(max_len):
            frame = {}
            for orig, frames in per_agent_frames.items():
                if step < len(frames):
                    x, y, desc = frames[step]
                else:
                    x, y, desc = frames[-1][0], frames[-1][1], "집에서 휴식"
                frame[orig] = (x, y, desc)
            self.timeline.append(frame)

    # -- frontend payloads ------------------------------------------------- #
    def home_payload(self) -> dict:
        return {
            "sim_code": self.sim_code,
            "step": 0,
            "persona_names": [
                {"original": p["original"], "underscore": p["underscore"], "initial": p["initial"]}
                for p in self.persona
            ],
            "persona_init_pos": [[p["original"], p["home"][0], p["home"][1]] for p in self.persona],
        }

    def _progressive_market(self, idx: int, final_market: dict) -> dict:
        """Linearly ramp indices + prices from the pre-round snapshot to final
        over the day's timeline, so numbers move in sync with the animation."""
        if not self.start_market or not self.final_market:
            return final_market
        n = max(1, len(self.timeline) - 1)
        f = max(0.0, min(1.0, idx / n))

        def lerp(a, b):
            return a + (b - a) * f

        out = dict(final_market)
        sm, fm = self.start_market, self.final_market
        for k in ("fearGreedIndex", "rumorSpeed", "panicSellRatio",
                  "fomoBuyRatio", "whaleBuyIntensity", "whaleSellIntensity"):
            if k in sm and k in fm:
                out[k] = lerp(float(sm[k]), float(fm[k]))
        assets = []
        for a in final_market.get("assets", []):
            sym = a["symbol"]
            sp = float(self.start_prices.get(sym, a["price"]))
            fp = float(self.final_prices.get(sym, a["price"]))
            price = lerp(sp, fp)
            a2 = dict(a)
            a2["price"] = price
            a2["change24h"] = ((price / sp - 1.0) * 100.0) if sp else a.get("change24h", 0)
            assets.append(a2)
        out["assets"] = assets
        start_sc = {s["agent"]: s["value"] for s in sm.get("sentimentContribution", [])}
        sc = []
        for s in fm.get("sentimentContribution", []):
            v0 = float(start_sc.get(s["agent"], s["value"]))
            s2 = dict(s)
            s2["value"] = lerp(v0, float(s["value"]))
            sc.append(s2)
        if sc:
            out["sentimentContribution"] = sc
        return out

    def movement_payload(self, step: int) -> dict:
        if step > self.last_poll_step:
            self.last_poll_step = step
        idx = step - self.base
        if not self.timeline or idx < 0 or idx >= len(self.timeline):
            return {"<step>": -1}
        frame = self.timeline[idx]
        st = self.game.state()
        rnd = self.game.round
        # Ramp market indices + prices from the pre-round snapshot to the final
        # values across the day animation, so the numbers change in step with the
        # agents' movement instead of all jumping at once.
        market = self._progressive_market(idx, st["market"])
        # Reveal posts progressively: a CURRENT-round agent post only appears once
        # that agent has ARRIVED at the board in the animation (board_arrival).
        # Past-round posts and the system 속보 are always shown.
        visible_posts = []
        for post in st["posts"]:
            aid = post.get("agentId")
            if post.get("round", 0) < rnd or aid == "system" or self.board_arrival.get(aid, 10**9) <= step:
                visible_posts.append(post)
        meta = {
            "curr_time": f"Day {self.game.round}",
            "round": self.game.round,
            "market": market,
            "posts": visible_posts,
            "events": st["events"],
            "agents": st["agents"],  # live agents (pre-computed portfolio + live cash/fear/greed/lastAction)
            "plans": st.get("plans", []),
            "round_report": st.get("round_report"),
            "finished": st.get("finished", False),
        }
        persona = {
            orig: {
                "movement": [int(x), int(y)],
                "pronunciatio": ".",
                "description": desc,
                "chat": None,
            }
            for orig, (x, y, desc) in frame.items()
        }
        return {"<step>": step, "persona": persona, "meta": meta}


def load_assets_from_artifact(artifact: dict) -> list[Asset]:
    """Build Asset models from a listup artifact dict (same shape as default_assets.json)."""
    out = []
    for a in artifact.get("assets", []):
        price = float(a.get("price") or 0.0)
        out.append(Asset(
            symbol=a["symbol"], name=a.get("name", a["symbol"]),
            price=price, change24h=float(a.get("change24h") or 0.0),
            volume=float(a.get("volume") or 0.0), priceHistory=[price],
            sector=a.get("sector", ""),
        ))
    return out


_SESSIONS: dict[str, Live] = {}  # uid -> Live


def _get_live(uid: str | None) -> Live | None:
    if uid and uid in _SESSIONS:
        return _SESSIONS[uid]
    # fallback: return the most recently created session (single-player compat)
    return next(iter(reversed(_SESSIONS.values())), None) if _SESSIONS else None


def _fetch_assets_from_upbit() -> dict | None:
    """Run listup.build_artifact() to get fresh Upbit prices. None on failure."""
    try:
        import listup  # noqa: E402 — repo root, added to sys.path above
        return listup.build_artifact()
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class StartBody(BaseModel):
    fork_sim_code: str | None = None
    sim_code: str
    seed: int | None = None  # optional user-specified seed


class ResumeBody(BaseModel):
    uid: str
    sim_code: str | None = None


class EventBody(BaseModel):
    uid: str | None = None
    text: str
    is_rumor: bool = False
    source: str = "user"


class StepBody(BaseModel):
    uid: str | None = None
    step: int
    sim_code: str | None = None
    environment: dict | None = None


class RunBody(BaseModel):
    uid: str | None = None
    count: int = 0


# --------------------------------------------------------------------------- #
# Control endpoints
# --------------------------------------------------------------------------- #
@app.get("/control/status")
def control_status(uid: str | None = None):
    live = _get_live(uid)
    if live is None:
        return {"loaded": False, "sim_code": None, "round": None,
                "running_steps": False, "timeline_len": 0}
    return {"loaded": True, "sim_code": live.sim_code, "uid": uid,
            "round": live.game.round,
            "running_steps": False, "timeline_len": len(live.timeline)}


@app.post("/control/start")
def control_start(body: StartBody):
    from backend import db  # lazy import

    _maze()  # warm the maze once

    # 1. Fetch fresh assets from Upbit
    artifact = _fetch_assets_from_upbit()
    if artifact is None:
        # Upbit API 실패 시 DB의 default_assets 사용
        doc = db.get_default_assets_base()
        if not doc:
            return {"status": "error", "error": "Upbit API 실패 + DB에 default_assets 없음 — python -m backend.seed 실행 필요"}
        artifact = doc

    # 2. Determine seed
    seed = body.seed if body.seed is not None else int.from_bytes(os.urandom(4), "big")

    # 3. Save to MongoDB, get UUID
    uid = db.create_session(artifact, seed=seed)

    # 4. Build Asset models from the artifact
    assets = load_assets_from_artifact(artifact)

    # 5. Create Live session
    live = Live(body.sim_code, assets=assets, seed=seed)
    _SESSIONS[uid] = live

    return {"status": "started", "sim_code": live.sim_code, "uid": uid, "seed": seed, "step": 0}


@app.post("/control/resume")
def control_resume(body: ResumeBody):
    """Resume a previously saved session from MongoDB."""
    from backend import db

    session = db.get_session(body.uid)
    if not session:
        return {"status": "error", "error": "session not found"}

    game_state = session.get("game_state")
    if not game_state:
        return {"status": "error", "error": "no saved game_state for this session"}

    _maze()
    artifact = session["default_assets"]
    seed = session["seed"]
    assets = load_assets_from_artifact(artifact)

    sim_code = body.sim_code or f"resume_{body.uid[:8]}"
    live = Live(sim_code, assets=assets, seed=seed)
    # Restore engine state from DB
    live.game = GameSession.restore(game_state, assets=assets, seed=seed)
    _SESSIONS[body.uid] = live

    return {
        "status": "resumed",
        "sim_code": sim_code,
        "uid": body.uid,
        "seed": seed,
        "round": live.game.round,
        "finished": live.game.finished,
        "step": 0,
    }


@app.post("/control/market/event")
def control_market_event(body: EventBody):
    live = _get_live(body.uid)
    if live is None:
        return {"status": "error", "error": "not started"}
    if live.game.finished:
        return {"status": "finished", "round": live.game.round,
                "error": "5 라운드 종료 — 재시작하세요"}
    live.start_market = live.game.market.model_dump()
    live.start_prices = {a.symbol: a.price for a in live.game.assets}
    try:
        live.game.run_round(body.text, source=body.source, is_rumor=body.is_rumor)
    except RuntimeError as e:
        return {"status": "finished", "round": live.game.round, "error": str(e)}
    except Exception as e:
        return {"status": "error", "round": live.game.round, "error": str(e)[:200]}
    _st = live.game.state()
    live.final_market = _st["market"]
    live.final_prices = {a["symbol"]: a["price"] for a in _st["market"]["assets"]}
    try:
        live.build_timeline()
    except Exception as e:
        return {"status": "error", "round": live.game.round, "error": f"timeline: {str(e)[:160]}"}

    # persist game state to DB
    try:
        from backend import db
        db.save_game_state(body.uid, _st) if body.uid else None
    except Exception:
        pass  # ponytail: DB save is best-effort, game continues

    ev = live.game.events[0] if live.game.events else None
    return {"status": "ok", "round": live.game.round,
            "event": ev.text if ev else body.text,
            "impact": (ev.impact.value if hasattr(ev.impact, "value") else ev.impact) if ev else "neutral"}


@app.get("/control/market/state")
def control_market_state(uid: str | None = None):
    live = _get_live(uid)
    if live is None:
        return {"ready": False}
    st = live.game.state()
    st["ready"] = True
    return st


@app.get("/control/report/overall")
def control_report_overall(uid: str | None = None):
    """FR-9/FR-10: overall report + achievements (shown when 5 rounds finish)."""
    live = _get_live(uid)
    if live is None:
        return {"ready": False}
    rep = live.game.overall_report()
    return {"ready": True, "finished": live.game.finished, "report": rep.model_dump()}


@app.post("/control/run")
def control_run(body: RunBody):
    return {"status": "ok", "count": body.count}


@app.get("/control/sessions")
def control_sessions():
    """List active in-memory sessions."""
    return [
        {"uid": uid, "sim_code": s.sim_code, "round": s.game.round,
         "finished": s.game.finished}
        for uid, s in _SESSIONS.items()
    ]


# --------------------------------------------------------------------------- #
# Data (map/movement) endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/home")
def api_home(uid: str | None = None):
    live = _get_live(uid)
    if live is None:
        return {"error": "backend_not_started"}
    return live.home_payload()


@app.post("/api/environment/process")
def api_env_process(body: StepBody):
    return {"ok": True}


@app.post("/api/environment/update")
def api_env_update(body: StepBody):
    live = _get_live(body.uid)
    if live is None:
        return {"<step>": -1}
    return live.movement_payload(body.step)
