"""Simulation loop: orchestrates one round of the 11-step process."""

import random
from datetime import datetime
from models import (
    GameState, EventState, PostState, Comment, ReportState,
    LLMAgentResponse,
)
from templates import DAILY_PLANS, REFLECTION_TEMPLATES, REFLECTION_THRESHOLD, AUTO_EVENTS
from engine import (
    apply_emotion, validate_trade, execute_trade,
    determine_location, calculate_prices, calculate_indicators,
)
from llm import call_agent, call_report


async def run_round(game: GameState, user_event_text: str | None = None) -> dict:
    """Execute one full simulation round. Returns round result dict for API response."""
    round_num = game.round
    now = datetime.now().strftime("%H:%M")

    # ── Step 1: Daily Plan (template) ──
    for agent in game.agents:
        agent.dailyPlan = DAILY_PLANS.get(agent.type, DAILY_PLANS["value"])

    # ── Step 2: Event ──
    round_events: list[EventState] = []
    if user_event_text:
        ev = EventState(
            id=f"e_{round_num}_user",
            round=round_num,
            text=user_event_text,
            source="user",
            impact="neutral",  # LLM will score poignancy per agent; impact determined below
            timestamp=now,
        )
        # ponytail: simple keyword-based impact instead of LLM call
        text_lower = user_event_text.lower()
        if any(w in text_lower for w in ["해킹", "규제", "하락", "폭락", "전쟁", "관세", "파산"]):
            ev.impact = "negative"
        elif any(w in text_lower for w in ["승인", "매수", "상승", "호재", "인하", "ETF"]):
            ev.impact = "positive"
        round_events.append(ev)
    else:
        auto = random.choice(AUTO_EVENTS)
        ev = EventState(
            id=f"e_{round_num}_auto",
            round=round_num,
            text=auto["text"],
            source="system",
            impact=auto["impact"],
            timestamp=now,
        )
        round_events.append(ev)

    game.events.extend(round_events)
    event_texts = [e.text for e in round_events]
    event_impact = round_events[0].impact if round_events else "neutral"

    # ── Steps 3-7: Agent LLM calls (shuffled order) ──
    agent_order = list(range(len(game.agents)))
    random.shuffle(agent_order)

    trades: list[dict] = []
    new_posts: list[PostState] = []
    agent_actions: list[dict] = []
    round_posts_so_far = list(game.posts[-10:])  # recent posts as context

    for idx in agent_order:
        agent = game.agents[idx]

        # LLM call
        response: LLMAgentResponse = await call_agent(
            agent=agent,
            assets=game.market.assets,
            recent_posts=round_posts_so_far,
            events_text=event_texts,
        )

        # Step 4: Emotion (rule-base clamp)
        apply_emotion(agent, response)

        # Step 5: Posts/comments
        posted = False
        commented = False
        if response.post.write and response.post.content:
            post = PostState(
                id=f"p_r{round_num}_{idx}",
                agentId=agent.id,
                agentAlias=agent.alias,
                content=response.post.content,
                asset=response.post.asset,
                likes=0,
                comments=[],
                timestamp=now,
                round=round_num,
            )
            new_posts.append(post)
            round_posts_so_far.append(post)
            posted = True

        if response.comment.write and response.comment.content and response.comment.targetPostId:
            target = next(
                (p for p in round_posts_so_far if p.id == response.comment.targetPostId),
                None,
            )
            if target:
                target.comments.append(Comment(
                    agentId=agent.id,
                    agentAlias=agent.alias,
                    content=response.comment.content,
                ))
                commented = True

        # Step 7: Trade (validate + execute)
        validated = validate_trade(agent, response.action, game.market.assets)
        execute_trade(agent, validated, game.market.assets)

        if validated.type != "HOLD" and validated.asset:
            trades.append({
                "asset": validated.asset,
                "type": validated.type,
                "amount": validated.amount,
            })

        # Step 8: Location
        agent.location = determine_location(validated, posted, commented)
        agent.bubble = response.bubble or ""

        agent_actions.append({
            "agent": agent.alias,
            "action": validated.type,
            "asset": validated.asset,
            "amount": validated.amount,
            "reason": validated.reason,
            "bubble": agent.bubble,
            "poignancy": response.poignancy,
        })

    # ── Step 9: Price calculation (rule-base) ──
    old_prices = {a.symbol: a.price for a in game.market.assets}
    calculate_prices(game.market.assets, trades, game.agents, event_impact)
    price_changes = [
        {
            "symbol": a.symbol,
            "name": a.name,
            "before": old_prices[a.symbol],
            "after": a.price,
            "change": a.change24h,
        }
        for a in game.market.assets
    ]

    # ── Market indicators ──
    indicators = calculate_indicators(game.agents, trades)
    game.market.fearGreedIndex = indicators.get("fearGreedIndex", 50)
    game.market.panicSellRatio = indicators.get("panicSellRatio", 0)
    game.market.fomoBuyRatio = indicators.get("fomoBuyRatio", 0)
    game.market.whaleBuyIntensity = indicators.get("whaleBuyIntensity", 0)
    game.market.whaleSellIntensity = indicators.get("whaleSellIntensity", 0)
    game.market.sentimentContribution = indicators.get("sentimentContribution", [])

    # Rumor speed: event-based + post count
    rumor_base = 60 if "루머" in (round_events[0].text if round_events else "") else 20
    game.market.rumorSpeed = min(100, rumor_base + len(new_posts) * 10)

    # ── Step 10: Report (LLM) ──
    report_md = await call_report(
        round_num=round_num,
        events_text=event_texts,
        agent_actions=agent_actions,
        price_changes=price_changes,
        sentiment_metrics=indicators,
    )
    report = ReportState(round=round_num, markdown=report_md)
    game.reports.append(report)

    # ── Step 11: Reflection (template) ──
    for agent in game.agents:
        if agent.importanceSum >= REFLECTION_THRESHOLD:
            reflection = REFLECTION_TEMPLATES.get(agent.type, "")
            if reflection:
                # ponytail: reflection goes into report as text, doesn't affect behavior
                report.markdown += f"\n\n> **{agent.alias}의 반성**: {reflection}"
            agent.importanceSum = 0

    # Add new posts to game state
    game.posts.extend(new_posts)
    game.round += 1

    return {
        "round": round_num,
        "events": [e.model_dump() for e in round_events],
        "agents": [a.model_dump() for a in game.agents],
        "market": game.market.model_dump(),
        "newPosts": [p.model_dump() for p in new_posts],
        "report": report.model_dump(),
    }
