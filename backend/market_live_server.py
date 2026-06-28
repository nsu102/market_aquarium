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

# --------------------------------------------------------------------------- #
# the_ville location mapping (use existing places).
# --------------------------------------------------------------------------- #
BOARD_ADDR = "the Ville:Hobbs Cafe:cafe:cafe customer seating"        # 게시판
EXCHANGE_ADDR = "the Ville:The Willows Market and Pharmacy:store:grocery store counter"  # 거래소

# Daily-life stops sprinkled between the mandatory board/exchange visits.
DAILY_SPOTS = [
    ("공원에서 산책", "the Ville:Johnson Park:park:park garden"),
    ("도서관에서 자료 조사", "the Ville:Oak Hill College:library:library table"),
    ("펍에서 한 잔", "the Ville:The Rose and Crown Pub:pub:bar customer seating"),
    ("공용 공간에서 잡담", "the Ville:artist's co-living space:common room:common room sofa"),
    ("마트 구경", "the Ville:Harvey Oak Supply Store:supply store:supply store product shelf"),
    ("카페에서 커피 한 잔", "the Ville:Hobbs Cafe:cafe:piano"),
]

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

    def __init__(self, sim_code: str):
        self.sim_code = sim_code
        self.game = GameSession()
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
            # Per-agent RNG so each persona's TIMING differs: a different start
            # delay (idle at home) and different linger at each stop means each one
            # reaches the board / exchange at a different step ("누가 언제 갔는가").
            arng = random.Random((hash(ag.id) & 0xFFFFFFFF) ^ (self.game.round * 2654435761))
            start_delay = arng.randint(0, 70)
            # three random daily-life stops: before board, between board & exchange,
            # and between exchange & home.
            spots = arng.sample(DAILY_SPOTS, 3)
            board_label = "게시판에 글 작성" if act.get("posted") else "게시판에서 분위기 확인"
            exch_label = TRADE_LABEL.get(act.get("trade_action", "HOLD"), "거래소에서 관망")

            waypoints = [
                (home, "집에서 하루 계획"),
                (self._tile_for(spots[0][1]) or home, spots[0][0]),
                (board_t or home, board_label),
                (self._tile_for(spots[1][1]) or home, spots[1][0]),
                (exch_t or home, exch_label),
                (self._tile_for(spots[2][1]) or home, spots[2][0]),
                (home, "집으로 귀가"),
            ]
            # idle at home first (staggered start)
            frames = [(home[0], home[1], "집에서 하루 계획") for _ in range(1 + start_delay)]
            for i in range(1, len(waypoints)):
                seg = self._path(waypoints[i - 1][0], waypoints[i][0])
                wx, wy = waypoints[i][0]
                label = waypoints[i][1]
                for t in seg[1:]:
                    frames.append((t[0], t[1], label))
                # arrival = the moment the agent reaches this waypoint tile
                if i == 2:  # board
                    self.board_arrival[ag.id] = self.base + len(frames) - 1
                elif i == 4:  # exchange
                    self.exchange_arrival[ag.id] = self.base + len(frames) - 1
                # linger at the destination so arrival timing spreads out further
                for _ in range(arng.randint(4, 18)):
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


_LIVE: Live | None = None


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #
class StartBody(BaseModel):
    fork_sim_code: str | None = None
    sim_code: str


class EventBody(BaseModel):
    text: str
    is_rumor: bool = False
    source: str = "user"


class StepBody(BaseModel):
    step: int
    sim_code: str | None = None
    environment: dict | None = None


class RunBody(BaseModel):
    count: int = 0


# --------------------------------------------------------------------------- #
# Control endpoints
# --------------------------------------------------------------------------- #
@app.get("/control/status")
def control_status():
    if _LIVE is None:
        return {"loaded": False, "sim_code": None, "round": None,
                "running_steps": False, "timeline_len": 0}
    return {"loaded": True, "sim_code": _LIVE.sim_code, "round": _LIVE.game.round,
            "running_steps": False, "timeline_len": len(_LIVE.timeline)}


@app.post("/control/start")
def control_start(body: StartBody):
    global _LIVE
    _maze()  # warm the maze once
    _LIVE = Live(body.sim_code)
    return {"status": "started", "sim_code": _LIVE.sim_code, "step": 0}


@app.post("/control/market/event")
def control_market_event(body: EventBody):
    if _LIVE is None:
        return {"status": "error", "error": "not started"}
    if _LIVE.game.finished:
        return {"status": "finished", "round": _LIVE.game.round,
                "error": "5 라운드 종료 — 재시작하세요"}
    # Snapshot BEFORE the round so the UI can ramp market/prices from here to the
    # post-round values across the day animation (numbers move in sync with movement).
    _LIVE.start_market = _LIVE.game.market.model_dump()
    _LIVE.start_prices = {a.symbol: a.price for a in _LIVE.game.assets}
    try:
        _LIVE.game.run_round(body.text, source=body.source, is_rumor=body.is_rumor)
    except RuntimeError as e:
        return {"status": "finished", "round": _LIVE.game.round, "error": str(e)}
    except Exception as e:  # transient LLM/data hiccup -> don't 500
        return {"status": "error", "round": _LIVE.game.round, "error": str(e)[:200]}
    _st = _LIVE.game.state()
    _LIVE.final_market = _st["market"]
    _LIVE.final_prices = {a["symbol"]: a["price"] for a in _st["market"]["assets"]}
    try:
        _LIVE.build_timeline()
    except Exception as e:
        return {"status": "error", "round": _LIVE.game.round, "error": f"timeline: {str(e)[:160]}"}
    ev = _LIVE.game.events[0] if _LIVE.game.events else None
    return {"status": "ok", "round": _LIVE.game.round,
            "event": ev.text if ev else body.text,
            "impact": (ev.impact.value if hasattr(ev.impact, "value") else ev.impact) if ev else "neutral"}


@app.get("/control/market/state")
def control_market_state():
    if _LIVE is None:
        return {"ready": False}
    st = _LIVE.game.state()
    st["ready"] = True
    return st


@app.get("/control/report/overall")
def control_report_overall():
    """FR-9/FR-10: overall report + achievements (shown when 5 rounds finish)."""
    if _LIVE is None:
        return {"ready": False}
    rep = _LIVE.game.overall_report()
    return {"ready": True, "finished": _LIVE.game.finished, "report": rep.model_dump()}


@app.post("/control/run")
def control_run(body: RunBody):
    # Timeline is built on the event; nothing to run here. Kept for FE compat.
    return {"status": "ok", "count": body.count}


# --------------------------------------------------------------------------- #
# Data (map/movement) endpoints
# --------------------------------------------------------------------------- #
@app.get("/api/home")
def api_home():
    if _LIVE is None:
        return {"error": "backend_not_started"}
    return _LIVE.home_payload()


@app.post("/api/environment/process")
def api_env_process(body: StepBody):
    return {"ok": True}


@app.post("/api/environment/update")
def api_env_update(body: StepBody):
    if _LIVE is None:
        return {"<step>": -1}
    return _LIVE.movement_payload(body.step)
