"""Single combined backend for LIVE mode.

Serves BOTH the data API (/api/*, /assets) and the control API (/control/*,
/control/market/*) on ONE port, so live mode needs just one backend + the
frontend. The standalone market API (:8100) is not used by live mode.

Run from reverie/backend_server:
    uvicorn live_server:app --port 8001
(MARKET_STUB_LLM=1 for the fast offline demo; set OPENROUTER_API_KEY for real LLM.)
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.normpath(os.path.join(_HERE, "..", ".."))
# reverie's own modules import flat (cwd = backend_server); api_server imports as
# a package from the repo root. Make both importable.
sys.path.insert(0, _HERE)
sys.path.insert(0, _REPO)

# control_server defines the FastAPI `app` (with /control/* + CORS for :3000).
from control_server import app  # noqa: E402
# api_server.main defines its own FastAPI app with /api/* routes + the /assets mount.
from api_server.main import app as _data_app  # noqa: E402

# Fold the data API's routes (including the /assets static mount) into the control
# app so a single port serves everything. control_server's CORS middleware already
# covers all routes on `app`.
_existing = {(getattr(r, "path", None), tuple(sorted(getattr(r, "methods", []) or [])))
             for r in app.router.routes}
for route in _data_app.routes:
    key = (getattr(route, "path", None), tuple(sorted(getattr(route, "methods", []) or [])))
    if key not in _existing:
        app.router.routes.append(route)
