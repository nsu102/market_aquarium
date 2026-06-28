"""LLM client: call OpenRouter for agent decisions and report generation."""

import json
import httpx
from config import OPENROUTER_API_KEY, OPENROUTER_URL, MODEL, TEMPERATURE
from models import AgentState, AssetState, PostState, LLMAgentResponse
from prompts import SYSTEM_TEMPLATE, AGENT_PERSONALITIES, REPORT_PROMPT


async def call_agent(
    agent: AgentState,
    assets: list[AssetState],
    recent_posts: list[PostState],
    events_text: list[str],
) -> LLMAgentResponse:
    """Single LLM call for one agent. Returns structured judgment."""
    personality_data = AGENT_PERSONALITIES.get(agent.type, AGENT_PERSONALITIES["value"])

    portfolio_str = ", ".join(
        f"{p.asset} {p.amount}개 (평균 {p.avgPrice:,.0f}원)" for p in agent.portfolio
    ) or "없음"

    assets_str = "\n".join(
        f"  - {a.symbol} ({a.name}): {a.price:,.0f}원 ({a.change24h:+.1f}%)" for a in assets
    )

    posts_str = "\n".join(
        f"  [{p.agentAlias}] {p.content}" for p in recent_posts[-10:]
    ) or "없음"

    events_str = "\n".join(f"  - {e}" for e in events_text) or "없음"

    daily_plan_str = "\n".join(f"  - {p}" for p in agent.dailyPlan) or "없음"

    system_prompt = SYSTEM_TEMPLATE.format(
        alias=agent.alias,
        description=personality_data["description"],
        personality=personality_data["personality"],
        dailyPlan=daily_plan_str,
        cash=f"{agent.cash:,.0f}",
        portfolio=portfolio_str,
        fear=agent.fear,
        greed=agent.greed,
        lastAction=agent.lastAction,
        assets=assets_str,
        recentPosts=posts_str,
        events=events_str,
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "위 상황을 분석하고 JSON으로 응답하세요."},
                ],
                "temperature": TEMPERATURE,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    try:
        data = json.loads(content)
        return LLMAgentResponse(**data)
    except (json.JSONDecodeError, Exception):
        # ponytail: fallback to HOLD on parse failure, no retry
        return LLMAgentResponse()


async def call_report(
    round_num: int,
    events_text: list[str],
    agent_actions: list[dict],
    price_changes: list[dict],
    sentiment_metrics: dict,
) -> str:
    """Generate round report markdown via LLM."""
    prompt = REPORT_PROMPT.format(
        round=round_num,
        events=json.dumps(events_text, ensure_ascii=False),
        agentActions=json.dumps(agent_actions, ensure_ascii=False),
        priceChanges=json.dumps(price_changes, ensure_ascii=False),
        sentimentMetrics=json.dumps(sentiment_metrics, ensure_ascii=False),
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": "리포트를 작성하세요."},
                ],
                "temperature": 0.5,
            },
        )
        resp.raise_for_status()

    return resp.json()["choices"][0]["message"]["content"]
