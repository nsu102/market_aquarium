# api_server — FastAPI backend for generative_agents

This is the FastAPI replacement for the Django web layer
(`environment/frontend_server/translator/views.py` + `urls.py`). The reverie
simulation engine is **unchanged** and talks to this server **only through the
filesystem** under `environment/frontend_server/`.

All data-file paths are resolved against `FRONTEND_ROOT`
(`<repo>/environment/frontend_server`), computed from this module's location, so
the server works regardless of the current working directory.

## Install

From the repo root:

```bash
pip install -r api_server/requirements.txt
```

(`fastapi`, `uvicorn[standard]`, `pydantic`)

## Run

From the **repo root**:

```bash
uvicorn api_server.main:app --reload --port 8000
```

Server: `http://127.0.0.1:8000`. CORS is enabled for `http://localhost:3000`
and `http://127.0.0.1:3000`.

## Static assets

`GET /assets/{path}` serves `environment/frontend_server/static_dirs/assets/{path}`
(e.g. `GET /assets/the_ville/visuals/the_ville_jan7.json`).

## Endpoints

| Method | Path | Replaces (Django view) |
| ------ | ---- | ---------------------- |
| GET  | `/api/home` | `home` |
| GET  | `/api/replay/{sim_code}/{step}` | `replay` |
| GET  | `/api/demo/{sim_code}/{step}?play_speed=2` | `demo` |
| GET  | `/api/persona_state/{sim_code}/{step}/{persona_name}` | `replay_persona_state` |
| POST | `/api/environment/process` | `process_environment` |
| POST | `/api/environment/update` | `update_environment` |
| GET/POST | `/api/path_tester_update` | `path_tester_update` |

### Notes on ported behavior

- `GET /api/home` reads `temp_storage/curr_sim_code.json` +
  `temp_storage/curr_step.json`. If `curr_step.json` is missing it returns
  `{"error":"backend_not_started"}` (HTTP 200). Otherwise it **deletes**
  `curr_step.json` (original side-effect) before returning.
- `persona_names` entries are `{"original","underscore","initial"}` where
  `initial` is the first letter of the first word + first letter of the last
  word, uppercased (e.g. `Isabella Rodriguez` -> `IR`).
- `persona_init_pos` for `/api/home` and `/api/replay` is a list of
  `[name_with_spaces, x, y]` taken from the highest-numbered
  `storage/<sim>/environment/<n>.json`.
- `/api/demo` `persona_init_pos` is a dict `Underscore_Name -> [x,y]`, and
  `all_movement` is keyed by stringified step.
- `/api/persona_state` splits associative nodes by `type` iterating
  `node_<N>..node_1` (highest to lowest), exactly like the original.
