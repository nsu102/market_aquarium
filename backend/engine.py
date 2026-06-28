"""Rule-base engine: emotion clamp, trade validation, price calculation, indicators."""

import random
from statistics import mean
from models import AgentState, AssetState, MarketState, LLMAgentResponse, LLMAction


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ── Step 4: Apply emotion delta ──

def apply_emotion(agent: AgentState, response: LLMAgentResponse) -> None:
    agent.fear = int(clamp(agent.fear + response.fearDelta, 0, 100))
    agent.greed = int(clamp(agent.greed + response.greedDelta, 0, 100))
    agent.importanceSum += response.poignancy


# ── Step 7: Validate and execute trade ──

def validate_trade(agent: AgentState, action: LLMAction, assets: list[AssetState]) -> LLMAction:
    """Clamp trade amounts to what the agent can actually do."""
    if action.type == "HOLD" or not action.asset:
        return LLMAction(type="HOLD", asset=None, amount=0, reason=action.reason)

    asset_state = next((a for a in assets if a.symbol == action.asset), None)
    if not asset_state:
        return LLMAction(type="HOLD", asset=None, amount=0, reason="종목 없음")

    price = asset_state.price

    if action.type in ("SELL", "SELL_LARGE"):
        holding = next((p for p in agent.portfolio if p.asset == action.asset), None)
        if not holding or holding.amount <= 0:
            return LLMAction(type="HOLD", asset=None, amount=0, reason="보유량 없음")
        action.amount = min(action.amount, holding.amount)

    if action.type in ("BUY", "BUY_LARGE"):
        if price <= 0:
            return LLMAction(type="HOLD", asset=None, amount=0, reason="가격 오류")
        max_buyable = agent.cash / price
        action.amount = min(action.amount, max_buyable)
        if action.amount <= 0:
            return LLMAction(type="HOLD", asset=None, amount=0, reason="현금 부족")

    return action


def execute_trade(agent: AgentState, action: LLMAction, assets: list[AssetState]) -> None:
    """Update agent cash and portfolio after validated trade."""
    if action.type == "HOLD" or not action.asset or action.amount <= 0:
        agent.lastAction = "대기"
        return

    asset_state = next((a for a in assets if a.symbol == action.asset), None)
    if not asset_state:
        return

    price = asset_state.price
    holding = next((p for p in agent.portfolio if p.asset == action.asset), None)

    if action.type in ("BUY", "BUY_LARGE"):
        cost = price * action.amount
        agent.cash -= cost
        if holding:
            total_cost = holding.avgPrice * holding.amount + cost
            holding.amount += action.amount
            holding.avgPrice = total_cost / holding.amount if holding.amount > 0 else 0
        else:
            from models import PortfolioItem
            agent.portfolio.append(PortfolioItem(asset=action.asset, amount=action.amount, avgPrice=price))
        agent.lastAction = f"{action.asset} {action.amount:.4f} 매수"

    elif action.type in ("SELL", "SELL_LARGE"):
        revenue = price * action.amount
        agent.cash += revenue
        if holding:
            holding.amount -= action.amount
            if holding.amount <= 0.0001:
                agent.portfolio = [p for p in agent.portfolio if p.asset != action.asset]
        agent.lastAction = f"{action.asset} {action.amount:.4f} 매도"


# ── Step 8: Determine location ──

def determine_location(action: LLMAction, posted: bool, commented: bool) -> str:
    if action.type in ("BUY", "SELL", "BUY_LARGE", "SELL_LARGE"):
        return "exchange"
    if posted or commented:
        return "community"
    return "home"


# ── Step 9: Price engine ──

def calculate_prices(
    assets: list[AssetState],
    trades: list[dict],  # [{"asset": str, "type": str, "amount": float}]
    agents: list[AgentState],
    event_impact: str,
) -> None:
    """Update asset prices based on event + trades + sentiment + noise."""
    for asset in assets:
        old_price = asset.price

        # Event shock
        shock_ranges = {"negative": (-3.0, -1.0), "positive": (1.0, 3.0), "neutral": (-0.5, 0.5)}
        lo, hi = shock_ranges.get(event_impact, (-0.5, 0.5))
        event_shock = random.uniform(lo, hi)

        # Trade pressure
        asset_trades = [t for t in trades if t["asset"] == asset.symbol]
        buy_vol = sum(t["amount"] * old_price for t in asset_trades if t["type"] in ("BUY", "BUY_LARGE"))
        sell_vol = sum(t["amount"] * old_price for t in asset_trades if t["type"] in ("SELL", "SELL_LARGE"))
        market_cap = old_price * 1000  # ponytail: simplified market cap proxy
        scale = 10
        trade_pressure = (buy_vol - sell_vol) / market_cap * scale if market_cap > 0 else 0

        # Sentiment pressure
        avg_fear = mean([a.fear for a in agents]) if agents else 50
        avg_greed = mean([a.greed for a in agents]) if agents else 50
        sentiment_weight = 2.0
        sentiment_pressure = (avg_greed - avg_fear) / 100 * sentiment_weight

        # Noise
        noise = random.gauss(0, 0.5)

        change_pct = event_shock + trade_pressure + sentiment_pressure + noise
        asset.price = round(old_price * (1 + change_pct / 100))
        asset.change24h = round(change_pct, 2)
        asset.priceHistory.append(asset.price)


# ── Market indicators ──

def calculate_indicators(agents: list[AgentState], trades: list[dict]) -> dict:
    """Compute market indicators from agent states and trades."""
    if not agents:
        return {}

    fear_greed = round(mean(a.greed for a in agents))

    sell_count = sum(1 for t in trades if t["type"] in ("SELL", "SELL_LARGE"))
    buy_count = sum(1 for t in trades if t["type"] in ("BUY", "BUY_LARGE"))
    total = len(agents)

    panic_sell_ratio = round(sell_count / total * 100) if total else 0
    fomo_buy_ratio = round(buy_count / total * 100) if total else 0

    # Whale intensity
    whale_buys = sum(t["amount"] for t in trades if t["type"] == "BUY_LARGE")
    whale_sells = sum(t["amount"] for t in trades if t["type"] == "SELL_LARGE")
    total_buys = sum(t["amount"] for t in trades if t["type"] in ("BUY", "BUY_LARGE"))
    total_sells = sum(t["amount"] for t in trades if t["type"] in ("SELL", "SELL_LARGE"))

    whale_buy_intensity = round(whale_buys / total_buys * 100) if total_buys > 0 else 0
    whale_sell_intensity = round(whale_sells / total_sells * 100) if total_sells > 0 else 0

    sentiment_contribution = [
        {"agent": a.alias, "value": a.greed - a.fear}
        for a in agents
    ]

    return {
        "fearGreedIndex": fear_greed,
        "panicSellRatio": panic_sell_ratio,
        "fomoBuyRatio": fomo_buy_ratio,
        "whaleBuyIntensity": whale_buy_intensity,
        "whaleSellIntensity": whale_sell_intensity,
        "sentimentContribution": sentiment_contribution,
    }
