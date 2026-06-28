"""Make the ``sim`` package importable from tests regardless of cwd."""

import os
import sys
from pathlib import Path

# Tests must be hermetic: run the simulation OFFLINE with the deterministic
# scripted client, never against a real API. The dev machine may export
# OPENAI_API_KEY in its OS environment, which would otherwise make LLMClient
# "available" and hit the network mid-test. Strip the keys before anything reads
# them so every client falls back to scripted/deterministic behaviour.
# Tell sim modules to skip loading the project's .env (which would re-add the
# key), then strip any ambient keys so every client is offline/deterministic.
os.environ["MARKET_DISABLE_LLM"] = "1"
for _k in ("OPENAI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"):
    os.environ.pop(_k, None)

sys.path.insert(0, str(Path(__file__).resolve().parent))
