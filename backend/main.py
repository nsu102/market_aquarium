"""FastAPI server for Market Aquarium."""

import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    GameCreateRequest, EventRequest, RoundNextRequest,
    GameState, AgentState, AssetState, MarketState, EventState,
    PortfolioItem,
)
from simulation import run_round
from storage import save_game, load_game, list_games

app = FastAPI(title="Market Aquarium", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# in-memory cache, backed by JSON files
games: dict[str, GameState] = {}


def get_game(game_id: str) -> GameState:
    # try memory first, then disk
    if game_id not in games:
        loaded = load_game(game_id)
        if loaded:
            games[game_id] = loaded
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="GAME_NOT_FOUND")
    return game


# ── Startup: load existing saves ──

@app.on_event("startup")
async def startup():
    for gid in list_games():
        loaded = load_game(gid)
        if loaded:
            games[gid] = loaded
    print(f"Loaded {len(games)} saved game(s)")


# ── 1. Game session ──

@app.post("/api/games", status_code=201)
async def create_game(req: GameCreateRequest):
    game_id = f"g_{uuid.uuid4().hex[:8]}"

    agents = [
        AgentState(
            id=a.id,
            alias=a.alias,
            type=a.type,
            sprite=a.sprite,
            cash=a.cash,
            portfolio=[PortfolioItem(**p.model_dump()) for p in a.portfolio],
            fear=a.fear,
            greed=a.greed,
            color=a.color,
        )
        for a in req.agents
    ]

    assets = [
        AssetState(
            symbol=a.symbol,
            name=a.name,
            price=a.price,
            priceHistory=[a.price],
        )
        for a in req.assets
    ]

    market = MarketState(
        assets=assets,
        sentimentContribution=[{"agent": a.alias, "value": 0} for a in agents],
    )

    game = GameState(gameId=game_id, agents=agents, market=market)
    games[game_id] = game
    save_game(game)

    return {
        "gameId": game_id,
        "round": game.round,
        "agents": [a.model_dump() for a in game.agents],
        "market": market.model_dump(),
    }


@app.get("/api/games/{game_id}")
async def get_game_state(game_id: str):
    game = get_game(game_id)
    return {
        "gameId": game.gameId,
        "round": game.round,
        "agents": [a.model_dump() for a in game.agents],
        "market": game.market.model_dump(),
        "posts": [p.model_dump() for p in game.posts],
        "events": [e.model_dump() for e in game.events],
    }


# ── 2. Events ──

@app.post("/api/games/{game_id}/events", status_code=201)
async def submit_event(game_id: str, req: EventRequest):
    game = get_game(game_id)

    impact = "neutral"
    text_lower = req.text.lower()
    if any(w in text_lower for w in ["해킹", "규제", "하락", "폭락", "전쟁", "관세", "파산"]):
        impact = "negative"
    elif any(w in text_lower for w in ["승인", "매수", "상승", "호재", "인하", "ETF"]):
        impact = "positive"

    from datetime import datetime
    ev = EventState(
        id=f"e_{len(game.events)}",
        round=game.round,
        text=req.text,
        source="user",
        impact=impact,
        timestamp=datetime.now().strftime("%H:%M"),
    )
    game.events.append(ev)
    save_game(game)

    return {"event": ev.model_dump()}


# ── 3. Round ──

@app.post("/api/games/{game_id}/rounds/next")
async def next_round(game_id: str, req: RoundNextRequest = RoundNextRequest()):
    game = get_game(game_id)
    result = await run_round(game, req.event)
    save_game(game)
    return result


# ── 4. Posts ──

@app.get("/api/games/{game_id}/posts")
async def get_posts(game_id: str, round: int | None = None, asset: str | None = None):
    game = get_game(game_id)
    posts = game.posts
    if round is not None:
        posts = [p for p in posts if p.round == round]
    if asset:
        posts = [p for p in posts if p.asset == asset]
    return {"posts": [p.model_dump() for p in posts]}


# ── 5. Reports ──

@app.get("/api/games/{game_id}/reports")
async def get_reports(game_id: str):
    game = get_game(game_id)
    return {"reports": [r.model_dump() for r in game.reports]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
