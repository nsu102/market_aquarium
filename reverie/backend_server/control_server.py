"""
Control server for the Reverie generative-agents backend.

This FastAPI app replaces the terminal `input()` prompts in reverie.py's
`__main__` block, so a frontend can start and drive the simulation over HTTP.

# Run:
#   cd reverie/backend_server
#   pip install -r control_requirements.txt
#   uvicorn control_server:app --port 8001
#
# The control server MUST be launched from reverie/backend_server so it shares
# reverie's relative-path imports (utils.fs_storage etc.).
#
# Runtime flow (see CONTROL_CONTRACT.md):
#   1. POST /control/start  -> constructs ReverieServer(fork_sim_code, sim_code);
#      writes temp_storage/curr_sim_code.json + curr_step.json.
#   2. POST /control/run    -> runs `command("run N")` in a BACKGROUND THREAD
#      (the call blocks waiting on the Phaser frontend, so it must not block HTTP).
#   3. Open the frontend simulator (/simulator) which drives the steps forward;
#      reverie computes + writes movement files each step. GET /control/status
#      shows `step` advancing.
"""

import os
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------
# reverie's utils.fs_storage is "../../environment/frontend_server/storage",
# relative to the backend_server directory. We absolutize from __file__ so that
# /control/sims works regardless of the process cwd.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_STORAGE_DIR = os.path.normpath(
    os.path.join(_BACKEND_DIR, "..", "..",
                 "environment", "frontend_server", "storage"))


# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
class _State:
  def __init__(self):
    self.rs = None                 # the single ReverieServer instance (or None)
    self.fork_sim_code = None      # str | None
    self.sim_code = None           # str | None
    self.running_steps = False     # bool: is a `run` thread active?
    self.last_output = ""          # str: last command output
    self.error = None              # str | None
    self.run_thread = None         # threading.Thread | None


STATE = _State()
LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Lazy reverie import
# ---------------------------------------------------------------------------
# Importing reverie pulls in selenium / persona / LLM modules, which is heavy
# and may fail if keys/drivers aren't configured. We defer it to the first
# /control/start so that merely importing this module (e.g. for route
# inspection) always succeeds.
def _get_reverie_server_cls():
  from reverie import ReverieServer
  return ReverieServer


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="Reverie Control Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------
class StartBody(BaseModel):
  fork_sim_code: str
  sim_code: str


class RunBody(BaseModel):
  count: int


class CommandBody(BaseModel):
  command: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _bad_request(message):
  return JSONResponse(status_code=400, content={"error": message})


def _drop_instance():
  STATE.rs = None
  STATE.fork_sim_code = None
  STATE.sim_code = None
  STATE.running_steps = False
  STATE.run_thread = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/control/sims")
def list_sims():
  sims = []
  if os.path.isdir(_STORAGE_DIR):
    for name in sorted(os.listdir(_STORAGE_DIR)):
      if name.startswith("."):
        continue
      if os.path.isdir(os.path.join(_STORAGE_DIR, name)):
        sims.append(name)
  return {"sims": sims}


@app.get("/control/status")
def status():
  loaded = STATE.rs is not None
  step = None
  curr_time = None
  sim_code = STATE.sim_code
  if loaded:
    try:
      step = STATE.rs.step
      curr_time = STATE.rs.curr_time.strftime("%B %d, %Y, %H:%M:%S")
      sim_code = STATE.rs.sim_code
    except Exception:
      pass
  return {
      "loaded": loaded,
      "sim_code": sim_code,
      "fork_sim_code": STATE.fork_sim_code,
      "step": step,
      "curr_time": curr_time,
      "running_steps": STATE.running_steps,
      "last_output": STATE.last_output,
      "error": STATE.error,
  }


@app.post("/control/start")
def start(body: StartBody):
  with LOCK:
    if STATE.rs is not None:
      return _bad_request("a simulation is already loaded")

    # Friendly pre-checks: the underlying ReverieServer constructor copies the
    # fork folder to the target folder with shutil.copytree, which fails with a
    # cryptic OS error if the target already exists or the fork is missing.
    fork_dir = os.path.join(_STORAGE_DIR, body.fork_sim_code)
    target_dir = os.path.join(_STORAGE_DIR, body.sim_code)
    if not os.path.isdir(fork_dir):
      return _bad_request(
          f"fork simulation '{body.fork_sim_code}' does not exist")
    if os.path.exists(target_dir):
      return _bad_request(
          f"target simulation '{body.sim_code}' already exists — "
          f"choose a different name")

    try:
      ReverieServer = _get_reverie_server_cls()
      rs = ReverieServer(body.fork_sim_code, body.sim_code)
    except Exception as e:
      STATE.error = str(e)
      return _bad_request(str(e))

    STATE.rs = rs
    STATE.fork_sim_code = body.fork_sim_code
    STATE.sim_code = rs.sim_code
    STATE.running_steps = False
    STATE.last_output = ""
    STATE.error = None

  return {"status": "started", "sim_code": rs.sim_code, "step": rs.step}


def _run_worker(count):
  try:
    ret_str, _should_break = STATE.rs.command(f"run {count}")
    STATE.last_output = ret_str
  except Exception as e:
    STATE.error = str(e)
    STATE.last_output = f"run failed: {e}"
  finally:
    STATE.running_steps = False


@app.post("/control/run")
def run(body: RunBody):
  with LOCK:
    if STATE.rs is None:
      return _bad_request("no simulation is loaded")
    if STATE.running_steps:
      return _bad_request("a run is already in progress")

    STATE.error = None
    STATE.running_steps = True
    t = threading.Thread(target=_run_worker, args=(body.count,), daemon=True)
    STATE.run_thread = t
    t.start()

  return {"status": "running", "count": body.count}


@app.post("/control/command")
def command(body: CommandBody):
  with LOCK:
    if STATE.rs is None:
      return _bad_request("no simulation is loaded")
    if STATE.running_steps:
      return _bad_request("a run is in progress; wait for it to finish")

    cmd = body.command.strip()
    # A bare `run ...` blocks (it waits on the Phaser frontend), so route it to
    # the threaded runner instead of executing it synchronously here.
    if cmd[:3].lower() == "run":
      if STATE.running_steps:
        return _bad_request("a run is already in progress")
      try:
        count = int(cmd.split()[-1])
      except (ValueError, IndexError):
        return _bad_request("invalid run command; expected 'run <N>'")
      STATE.error = None
      STATE.running_steps = True
      t = threading.Thread(target=_run_worker, args=(count,), daemon=True)
      STATE.run_thread = t
      t.start()
      return {"output": f"started run {count} in background "
                        f"(use /control/status to watch progress)",
              "ended": False}

    try:
      ret_str, should_break = STATE.rs.command(cmd)
      STATE.last_output = ret_str
    except Exception as e:
      STATE.error = str(e)
      return _bad_request(str(e))

    if should_break:
      _drop_instance()

  return {"output": ret_str, "ended": should_break}


@app.post("/control/save")
def save():
  with LOCK:
    if STATE.rs is None:
      return _bad_request("no simulation is loaded")
    if STATE.running_steps:
      return _bad_request("a run is in progress; wait for it to finish")
    try:
      STATE.rs.command("save")
    except Exception as e:
      STATE.error = str(e)
      return _bad_request(str(e))
    step = STATE.rs.step

  return {"status": "saved", "step": step}


@app.post("/control/finish")
def finish():
  with LOCK:
    if STATE.rs is None:
      return _bad_request("no simulation is loaded")
    if STATE.running_steps:
      return _bad_request("a run is in progress; wait for it to finish")
    try:
      STATE.rs.command("fin")
    except Exception as e:
      STATE.error = str(e)
      return _bad_request(str(e))
    _drop_instance()

  return {"status": "finished"}


@app.post("/control/exit")
def exit_sim():
  with LOCK:
    if STATE.rs is None:
      return _bad_request("no simulation is loaded")
    if STATE.running_steps:
      return _bad_request("a run is in progress; wait for it to finish")
    try:
      STATE.rs.command("exit")
    except Exception as e:
      STATE.error = str(e)
      return _bad_request(str(e))
    _drop_instance()

  return {"status": "exited"}
