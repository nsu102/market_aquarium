# Market Village — Simulation Backend

The market-logic API the frontend talks to. It composes the FR modules into the
core thesis loop per round:

> event -> emotion change -> board posts (contagion) -> trades -> price distortion -> round report

This is the **walking skeleton** (vertical slice). It runs standalone and is
decoupled from the reverie cognitive loop / Phaser movement; that integration is
a later phase. There are three servers in this repo:

| Server | Port | Role | Start from |
|---|---|---|---|
| **Market API** (this) | 8100 | market logic: agents, events, trades, price, reports | `backend/` |
| Data API (`api_server`) | 8000 | reverie movement/persona JSON for the Phaser viewer | repo root |
| Control server | 8001 | drives the reverie engine | `reverie/backend_server/` |

For the current vertical slice the frontend only needs the **Market API (8100)**.

## Setup

```bash
cd backend
python -m pip install -r requirements.txt
```

LLM is optional. With no key the simulation uses a deterministic **scripted
offline client** so the demo stays lively. For real LLM-driven posts/emotions,
set the env vars (never commit keys — see repo-root `.env.example`):

```bash
export OPENROUTER_API_KEY=sk-or-...        # rotate the old leaked key
export OPENROUTER_MODEL=anthropic/claude-3.5-haiku
```

## MongoDB + Docker

모든 시드 데이터(에이전트, 포트폴리오 배분, 유니버스, 종목)는 MongoDB에 저장됩니다.

### 1. MongoDB 실행

```bash
# backend/ 에서
docker compose up -d          # MongoDB 27018 포트
```

Connection string: `mongodb://localhost:27018`
DB name: `market_village`

환경변수로 오버라이드 가능:
- `MONGO_URI` (기본 `mongodb://localhost:27018`)
- `MONGO_DB` (기본 `market_village`)

### 2. 시드 데이터 삽입

```bash
# backend/ 에서
python -m backend.seed        # 또는 python seed.py
```

멱등(idempotent) — 실행할 때마다 drop 후 재삽입.

| 컬렉션 | 건수 | 원본 | 설명 |
|---------|------|------|------|
| `personas` | 8 | `sim/personas.py` | 에이전트 성격/프로필 (alias, type, fear/greed, scratch text 등) |
| `allocations` | 8 | `sim/portfolio_allocations.json` | 페르소나별 초기자본, 현금%, 종목별 투자 비중 |
| `universe` | 1 | `universe.json` | 8섹터 구조, 37종목, 가중치 |
| `default_assets` | 1 | `default_assets.json` | 종목 한글명, 초기 Upbit 시세, 거래량 |
| `sessions` | 유저별 | 게임 시작 시 자동 생성 | UUID별 seed + 자산 스냅샷 + game_state |

### 3. 데이터 수정

DB 데이터를 직접 수정하면 에이전트/종목/배분이 변경됩니다.
코드/JSON 파일을 수정한 경우 `cd backend && python seed.py`로 DB에 반영.

## Run

```bash
cd backend
python -m uvicorn app:app --reload --port 8100
```

## Test

```bash
cd backend
python -m pytest -q          # 63 tests: 7 FR modules + engine integration
```

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | status, max_rounds, game_active |
| GET | `/api/assets` | | assets[], sectors[] |
| POST | `/api/game/start` | `{num_agents=6, seed=42}` | GameState |
| GET | `/api/game/state` | | GameState |
| POST | `/api/game/event` | `{text, source?, is_rumor?, cred_source?}` | GameState + round_report |
| GET | `/api/game/report` | | overall report + achievements |

`GameState = {round, max_rounds, finished, agents[], market, posts[], events[], sectors[]}`
— shapes mirror `frontend/mock_data/*.ts` so the UI swaps mock for API directly.

## Module map (`sim/`)

| File | FR | Role |
|---|---|---|
| `models.py` | — | shared pydantic contract (single source of truth) |
| `llm.py` | — | OpenRouter client + FakeLLM + scripted offline client + safe_json |
| `assets.py` | §3.3 | 종목 로드 (MongoDB first, file fallback) |
| `personas.py` | §3.1 | 에이전트 풀 로드 (MongoDB first, hardcoded fallback) |
| `emotion.py` | FR-2 | fear/greed delta (LLM) + apply/clamp |
| `credibility.py` | FR-2b | news credibility 1..10 (poig_score style) |
| `sns.py` | FR-3 | view_sns: read feed + one utterance (POST/COMMENT/REPLY/SKIP) |
| `trade.py` | FR-5 | rule-based trade decision + execution (deterministic) |
| `price_engine.py` | FR-7 | price = event + order pressure + emotion overheat + noise |
| `market_state.py` | — | aggregate dashboard indices (FE MarketData) |
| `report.py` | FR-9/10 | round + overall reports, achievements |
| `engine.py` | FR-1/4/6/8 | round orchestration (GameSession) |
| `app.py` | — | FastAPI surface |
```

## Frontend

```bash
cd frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_SIM_API=http://127.0.0.1:8100
npm install
npm run dev                          # http://localhost:3000
```

The frontend falls back to mock data if the backend is unreachable, so it still
demos offline; with the backend up it drives real rounds.