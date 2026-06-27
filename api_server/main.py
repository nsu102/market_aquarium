"""
FastAPI backend for the Stanford "generative_agents" project.

This replaces the Django web layer (environment/frontend_server/translator/views.py
+ urls.py). The reverie simulation engine is UNCHANGED and communicates with this
web layer ONLY through the filesystem under environment/frontend_server/.

Run from the repo root:

    uvicorn api_server.main:app --reload --port 8000

All data-file paths are resolved relative to FRONTEND_ROOT (computed from this
module's location) so the server works regardless of the process cwd.
"""

import os
import json
import datetime
from os import listdir
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------
# This file lives at <repo>/api_server/main.py, so parents[1] == <repo>.
REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ROOT = REPO_ROOT / "environment" / "frontend_server"
ASSETS_DIR = FRONTEND_ROOT / "static_dirs" / "assets"


def fpath(*parts: str) -> Path:
  """Join path parts onto FRONTEND_ROOT (never relies on cwd)."""
  return FRONTEND_ROOT.joinpath(*parts)


# ---------------------------------------------------------------------------
# Helpers ported from global_methods.py
# ---------------------------------------------------------------------------
def check_if_file_exists(curr_file: Path) -> bool:
  """Checks if a file exists (mirrors global_methods.check_if_file_exists)."""
  try:
    with open(curr_file):
      pass
    return True
  except Exception:
    return False


def find_filenames(path_to_dir: Path, suffix: str = ".csv") -> List[str]:
  """
  Given a directory, find all files/dirs whose name ends with the provided
  suffix and return their paths (mirrors global_methods.find_filenames, using
  forward slashes like the original).
  """
  filenames = listdir(path_to_dir)
  base = str(path_to_dir).replace("\\", "/")
  return [base + "/" + filename
          for filename in filenames if filename.endswith(suffix)]


def persona_name_obj(p: str) -> Dict[str, str]:
  """
  Build the {original, underscore, initial} object for a persona name.
  initial = first letter of first word + first letter of last word, uppercased,
  mirroring the original `p[0] + p.split(" ")[-1][0]`.
  """
  initial = (p[0] + p.split(" ")[-1][0]).upper()
  return {"original": p,
          "underscore": p.replace(" ", "_"),
          "initial": initial}


def collect_personas(sim_code: str):
  """
  Read persona folder names under storage/<sim_code>/personas, skipping
  dotfiles. Returns (persona_names_objs, persona_names_set).
  """
  persona_names: List[Dict[str, str]] = []
  persona_names_set = set()
  personas_dir = fpath("storage", sim_code, "personas")
  for i in find_filenames(personas_dir, ""):
    x = i.split("/")[-1].strip()
    if x and x[0] != ".":
      persona_names.append(persona_name_obj(x))
      persona_names_set.add(x)
  return persona_names, persona_names_set


def init_positions_from_environment(sim_code: str, persona_names_set) -> List[list]:
  """
  Read the highest-numbered storage/<sim_code>/environment/<n>.json and emit
  [name_with_spaces, x, y] for every persona key present in that file.
  """
  persona_init_pos: List[list] = []
  file_count: List[int] = []
  env_dir = fpath("storage", sim_code, "environment")
  for i in find_filenames(env_dir, ".json"):
    x = i.split("/")[-1].strip()
    if x and x[0] != ".":
      file_count.append(int(x.split(".")[0]))
  curr_json = fpath("storage", sim_code, "environment", f"{max(file_count)}.json")
  with open(curr_json) as json_file:
    persona_init_pos_dict = json.load(json_file)
    for key, val in persona_init_pos_dict.items():
      if key in persona_names_set:
        persona_init_pos.append([key, val["x"], val["y"]])
  return persona_init_pos


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Generative Agents API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static game assets: GET /assets/{path} -> static_dirs/assets/{path}
if ASSETS_DIR.exists():
  app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# ---------------------------------------------------------------------------
# Pydantic models for POST bodies
# ---------------------------------------------------------------------------
class ProcessEnvironmentBody(BaseModel):
  step: int
  sim_code: str
  environment: Dict[str, Any]


class UpdateEnvironmentBody(BaseModel):
  step: int
  sim_code: str


class PathTesterBody(BaseModel):
  camera: Dict[str, Any]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/home")
def api_home():
  """
  Ports views.home: reads curr_sim_code.json + curr_step.json. If curr_step.json
  is missing returns {"error":"backend_not_started"} (HTTP 200). Otherwise it
  deletes curr_step.json (original side-effect) and returns the simulate context.
  """
  f_curr_sim_code = fpath("temp_storage", "curr_sim_code.json")
  f_curr_step = fpath("temp_storage", "curr_step.json")

  if not check_if_file_exists(f_curr_step) or not check_if_file_exists(f_curr_sim_code):
    return JSONResponse({"error": "backend_not_started"})

  # A stale curr_sim_code may point at a sim folder that no longer exists; treat
  # any load/listing failure as "not started yet" rather than a 500 (a 500 also
  # drops CORS headers, which surfaces as a confusing CORS error in the browser).
  try:
    with open(f_curr_sim_code) as json_file:
      sim_code = json.load(json_file)["sim_code"]
    with open(f_curr_step) as json_file:
      step = json.load(json_file)["step"]

    persona_names, persona_names_set = collect_personas(sim_code)
    persona_init_pos = init_positions_from_environment(sim_code, persona_names_set)
  except Exception:
    return JSONResponse({"error": "backend_not_started"})

  os.remove(f_curr_step)

  return JSONResponse({
      "sim_code": sim_code,
      "step": step,
      "mode": "simulate",
      "persona_names": persona_names,
      "persona_init_pos": persona_init_pos,
  })


@app.get("/api/replay/{sim_code}/{step}")
def api_replay(sim_code: str, step: int):
  """Ports views.replay. Same shape as /api/home but mode=replay, no deletion."""
  persona_names, persona_names_set = collect_personas(sim_code)
  persona_init_pos = init_positions_from_environment(sim_code, persona_names_set)

  return JSONResponse({
      "sim_code": sim_code,
      "step": int(step),
      "mode": "replay",
      "persona_names": persona_names,
      "persona_init_pos": persona_init_pos,
  })


@app.get("/api/demo/{sim_code}/{step}")
def api_demo(sim_code: str, step: int, play_speed: str = "2"):
  """
  Ports views.demo: builds the full all_movement payload from
  compressed_storage/<sim>/master_movement.json + meta.json.
  """
  move_file = fpath("compressed_storage", sim_code, "master_movement.json")
  meta_file = fpath("compressed_storage", sim_code, "meta.json")
  step = int(step)

  play_speed_opt = {"1": 1, "2": 2, "3": 4, "4": 8, "5": 16, "6": 32}
  if play_speed not in play_speed_opt:
    play_speed = 2
  else:
    play_speed = play_speed_opt[play_speed]

  # Loading the basic meta information about the simulation.
  with open(meta_file) as json_file:
    meta = json.load(json_file)

  sec_per_step = meta["sec_per_step"]
  start_datetime = datetime.datetime.strptime(
      meta["start_date"] + " 00:00:00", "%B %d, %Y %H:%M:%S")
  for _ in range(step):
    start_datetime += datetime.timedelta(seconds=sec_per_step)
  start_datetime = start_datetime.strftime("%Y-%m-%dT%H:%M:%S")

  # Loading the movement file
  with open(move_file) as json_file:
    raw_all_movement = json.load(json_file)

  # Loading all names of the personas
  persona_names: List[Dict[str, str]] = []
  persona_names_set = set()
  for p in list(raw_all_movement["0"].keys()):
    persona_names.append(persona_name_obj(p))
    persona_names_set.add(p)

  # <all_movement> is the main movement variable passed to the frontend. For
  # this demo we send all movement information in one payload. JSON object keys
  # are strings, so we build with string keys directly (the original relied on
  # json.dumps to stringify the int keys).
  all_movement: Dict[str, Any] = dict()

  # Preparing the initial step: <init_prep> sets the locations and descriptions
  # of all agents at the beginning of the demo determined by <step>.
  init_prep: Dict[str, Any] = dict()
  for int_key in range(step + 1):
    key = str(int_key)
    val = raw_all_movement[key]
    for p in persona_names_set:
      if p in val:
        init_prep[p] = val[p]

  persona_init_pos: Dict[str, Any] = dict()
  for p in persona_names_set:
    persona_init_pos[p.replace(" ", "_")] = init_prep[p]["movement"]
  all_movement[str(step)] = init_prep

  # Finish loading <all_movement>.
  for int_key in range(step + 1, len(raw_all_movement.keys())):
    all_movement[str(int_key)] = raw_all_movement[str(int_key)]

  return JSONResponse({
      "sim_code": sim_code,
      "step": step,
      "mode": "demo",
      "persona_names": persona_names,
      "persona_init_pos": persona_init_pos,
      "all_movement": all_movement,
      "start_datetime": start_datetime,
      "sec_per_step": sec_per_step,
      "play_speed": play_speed,
  })


@app.get("/api/persona_state/{sim_code}/{step}/{persona_name}")
def api_persona_state(sim_code: str, step: int, persona_name: str):
  """
  Ports views.replay_persona_state. persona_name arrives underscored; convert
  '_' -> space to find the folder. Splits associative nodes by type iterating
  node_<N>..node_1 (highest to lowest), exactly like the original.
  """
  step = int(step)

  persona_name_underscore = persona_name
  persona_name = " ".join(persona_name.split("_"))

  memory = fpath("storage", sim_code, "personas", persona_name, "bootstrap_memory")
  if not os.path.exists(memory):
    memory = fpath("compressed_storage", sim_code, "personas", persona_name,
                   "bootstrap_memory")

  with open(memory / "scratch.json") as json_file:
    scratch = json.load(json_file)

  with open(memory / "spatial_memory.json") as json_file:
    spatial = json.load(json_file)

  with open(memory / "associative_memory" / "nodes.json") as json_file:
    associative = json.load(json_file)

  a_mem_event = []
  a_mem_chat = []
  a_mem_thought = []

  for count in range(len(associative.keys()), 0, -1):
    node_id = f"node_{str(count)}"
    node_details = associative[node_id]

    if node_details["type"] == "event":
      a_mem_event.append(node_details)
    elif node_details["type"] == "chat":
      a_mem_chat.append(node_details)
    elif node_details["type"] == "thought":
      a_mem_thought.append(node_details)

  return JSONResponse({
      "sim_code": sim_code,
      "step": step,
      "persona_name": persona_name,
      "persona_name_underscore": persona_name_underscore,
      "scratch": scratch,
      "spatial": spatial,
      "a_mem_event": a_mem_event,
      "a_mem_chat": a_mem_chat,
      "a_mem_thought": a_mem_thought,
  })


@app.post("/api/environment/process")
def api_process_environment(body: ProcessEnvironmentBody):
  """
  <FRONTEND to BACKEND> Ports views.process_environment. Writes the frontend
  visual world state to storage/<sim>/environment/<step>.json (indent=2).
  """
  out_path = fpath("storage", body.sim_code, "environment", f"{body.step}.json")
  with open(out_path, "w") as outfile:
    outfile.write(json.dumps(body.environment, indent=2))

  return JSONResponse({"status": "received"})


@app.post("/api/environment/update")
def api_update_environment(body: UpdateEnvironmentBody):
  """
  <BACKEND to FRONTEND> Ports views.update_environment. If the movement file
  exists, load it and set "<step>"=step; otherwise return {"<step>": -1}.
  """
  response_data: Dict[str, Any] = {"<step>": -1}
  move_path = fpath("storage", body.sim_code, "movement", f"{body.step}.json")
  if check_if_file_exists(move_path):
    # The backend may be mid-write on this file (the engine writes it while the
    # frontend polls). A partial/empty read raises JSONDecodeError -- treat that
    # as "not ready yet" so the client simply retries on the next poll.
    try:
      with open(move_path) as json_file:
        response_data = json.load(json_file)
      response_data["<step>"] = body.step
    except (ValueError, OSError):
      response_data = {"<step>": -1}

  return JSONResponse(response_data)


@app.post("/api/path_tester_update")
@app.get("/api/path_tester_update")
def api_path_tester_update(body: Optional[PathTesterBody] = None):
  """
  Ports views.path_tester_update. Writes temp_storage/path_tester_env.json.
  Accepts a POST body {"camera": {...}}; GET is accepted for parity but a
  camera body is required to write the file.
  """
  if body is None:
    return JSONResponse({"status": "no camera data"})

  out_path = fpath("temp_storage", "path_tester_env.json")
  with open(out_path, "w") as outfile:
    outfile.write(json.dumps(body.camera, indent=2))

  return JSONResponse({"status": "received"})
