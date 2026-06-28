"""FR-10 round/overall reports + FR-9 achievements.

The frontend renders the ``markdown`` field directly (react-markdown), so this
module produces concise Korean reports -- no emoji, markdown tables/sections.

The product's core thesis is "emotion moves price": each round report surfaces
``emotion_contribution_share`` -- the fraction of the round's absolute price
move attributable to the emotion_overheat component (vs event_impact +
order_pressure + noise).

This module depends ONLY on sim.models and the stdlib (no other sim modules).
"""

from __future__ import annotations

from .models import (
    Achievement,
    Action,
    Agent,
    EndingResult,
    MarketData,
    OverallReport,
    PriceBreakdown,
    RoundReport,
    TradeResult,
)


# --------------------------------------------------------------------------- #
# Emotion contribution
# --------------------------------------------------------------------------- #
def emotion_contribution_share(breakdowns: list[PriceBreakdown]) -> float:
    """Fraction of absolute price move coming from emotion_overheat.

    share = sum(|emotion_overheat|) / sum(|event| + |order| + |emotion| + |noise|)

    Returns 0.0 when the denominator is 0; always within [0, 1].
    """
    emotion = 0.0
    total = 0.0
    for b in breakdowns:
        emotion += abs(b.emotion_overheat)
        total += (
            abs(b.event_impact)
            + abs(b.order_pressure)
            + abs(b.emotion_overheat)
            + abs(b.noise)
        )
    if total <= 0:
        return 0.0
    share = emotion / total
    # Guard against floating-point drift past the [0, 1] bounds.
    return max(0.0, min(1.0, share))


# --------------------------------------------------------------------------- #
# Net worth helper
# --------------------------------------------------------------------------- #
def _net_worth(agent: Agent, prices: dict[str, float] | None = None) -> float:
    """Net worth: cash + holdings. Valued at CURRENT market price when a
    ``prices`` map is provided (so price appreciation shows up as P&L), else at
    avgPrice (self-contained fallback)."""
    if prices:
        holdings = sum(h.amount * prices.get(h.asset, h.avgPrice) for h in agent.portfolio)
    else:
        holdings = sum(h.amount * h.avgPrice for h in agent.portfolio)
    return agent.cash + holdings


def _total_holdings(agent: Agent) -> float:
    return sum(h.amount for h in agent.portfolio)


# --------------------------------------------------------------------------- #
# Round report (FR-10)
# --------------------------------------------------------------------------- #
def build_round_report(
    round: int,
    market: MarketData,
    breakdowns: list[PriceBreakdown],
    agents: list[Agent],
    trades: list[TradeResult],
) -> RoundReport:
    """Assemble a single round's report (indices + per-asset attribution)."""
    share = emotion_contribution_share(breakdowns)
    markdown = _round_markdown(round, market, breakdowns, trades, share, agents)
    return RoundReport(
        round=round,
        fearGreedIndex=market.fearGreedIndex,
        panicSellRatio=market.panicSellRatio,
        fomoBuyRatio=market.fomoBuyRatio,
        emotion_contribution_share=share,
        markdown=markdown,
        price_breakdowns=list(breakdowns),
    )


_ACTION_KR = {"BUY": "매수", "SELL": "매도", "BUY_LARGE": "대량매수", "HOLD": "관망"}


def _round_markdown(
    round: int,
    market: MarketData,
    breakdowns: list[PriceBreakdown],
    trades: list[TradeResult],
    share: float,
    agents: list[Agent] | None = None,
) -> str:
    """Render the Korean markdown body for a round report (no emoji)."""
    lines: list[str] = []
    lines.append(f"# 라운드 {round} 리포트")
    lines.append("")

    # --- Market indices section --------------------------------------------
    lines.append("## 시장 심리 지표")
    lines.append("")
    lines.append("| 지표 | 값 |")
    lines.append("| --- | --- |")
    lines.append(f"| 공포/탐욕 지수 | {market.fearGreedIndex:.1f} |")
    lines.append(f"| 패닉셀 비율 | {market.panicSellRatio * 100:.1f}% |")
    lines.append(f"| FOMO 매수 비율 | {market.fomoBuyRatio * 100:.1f}% |")
    lines.append("")

    # --- Emotion contribution (the core thesis) ----------------------------
    lines.append("## 감정 기여도")
    lines.append("")
    lines.append(
        f"이번 라운드 가격 변동 중 **{share * 100:.1f}%** 가 "
        "감정 과열(공포/탐욕)에서 비롯되었습니다."
    )
    lines.append("")
    lines.append("뉴스가 시장을 움직이는 것이 아니라, 뉴스에 반응하는 감정이 가격을 움직입니다.")
    lines.append("")

    # --- Per-asset breakdown -----------------------------------------------
    lines.append("## 종목별 가격 변동")
    lines.append("")
    if breakdowns:
        lines.append("| 종목 | 변동률 | 이벤트 | 매매압력 | 감정 | 노이즈 |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for b in breakdowns:
            lines.append(
                f"| {b.symbol} | {b.total_pct:+.2f}% | {b.event_impact:+.2f} | "
                f"{b.order_pressure:+.2f} | {b.emotion_overheat:+.2f} | "
                f"{b.noise:+.2f} |"
            )
    else:
        lines.append("이번 라운드에는 가격 변동이 없었습니다.")
    lines.append("")

    # --- Per-agent metrics -------------------------------------------------
    if agents:
        trade_by_agent = {t.agent_id: t for t in trades}
        lines.append("## 에이전트 지표")
        lines.append("")
        lines.append("| 에이전트 | 행동 | 종목 | 공포 | 탐욕 |")
        lines.append("| --- | --- | --- | --- | --- |")
        for a in agents:
            t = trade_by_agent.get(a.id)
            action = _ACTION_KR.get(a.lastAction, a.lastAction or "-")
            symbol = (t.symbol if t and t.symbol else "-")
            lines.append(
                f"| {a.alias} | {action} | {symbol} | {a.fear:.0f} | {a.greed:.0f} |"
            )
        lines.append("")

    # --- Trade summary -----------------------------------------------------
    lines.append("## 매매 요약")
    lines.append("")
    if trades:
        traded = [t for t in trades if t.action != Action.HOLD]
        lines.append(f"총 {len(traded)}건의 매매가 발생했습니다.")
    else:
        lines.append("이번 라운드에는 매매가 없었습니다.")

    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Achievements (FR-9)
# --------------------------------------------------------------------------- #
# A panic seller "completes the panic" if they end with effectively no holdings.
_LOW_HOLDINGS_EPS = 1e-9


def award_achievements(
    agents: list[Agent],
    initial_state: dict[str, dict] | None = None,
    prices: dict[str, float] | None = None,
) -> list[Achievement]:
    """Award end-of-game achievements (FR-9).

    ``initial_state`` maps agent.id -> {"cash": float, "net_worth": float}
    captured at game start. When omitted, achievements are based on the current
    state only (no growth-based awards).

    Returns at least one achievement when ``agents`` is non-empty.
    """
    achievements: list[Achievement] = []
    if not agents:
        return achievements

    # --- Highest current cash ----------------------------------------------
    richest = max(agents, key=lambda a: a.cash)
    achievements.append(
        Achievement(
            agent_id=richest.id,
            title="현금 부자",
            description=(
                f"{richest.alias} 님이 가장 많은 현금 "
                f"{richest.cash:,.0f} 을 보유한 채 장을 마쳤습니다."
            ),
        )
    )

    # --- Type-flavoured awards ---------------------------------------------
    for a in agents:
        if a.type == "panic_seller" and _total_holdings(a) <= _LOW_HOLDINGS_EPS:
            achievements.append(
                Achievement(
                    agent_id=a.id,
                    title="패닉셀 완주",
                    description=(
                        f"{a.alias} 님이 보유 자산을 모두 던지며 "
                        "패닉셀을 완주했습니다."
                    ),
                )
            )
        if a.type == "whale":
            achievements.append(
                Achievement(
                    agent_id=a.id,
                    title="고래의 여유",
                    description=(
                        f"{a.alias} 님이 시장의 공포 속에서도 "
                        "여유를 잃지 않았습니다."
                    ),
                )
            )

    # --- Best performer (growth) -- requires initial_state -----------------
    if initial_state:
        best_agent: Agent | None = None
        best_growth = float("-inf")
        best_start = 0.0
        for a in agents:
            start = initial_state.get(a.id)
            if not start:
                continue
            start_worth = float(start.get("net_worth", start.get("cash", 0.0)))
            growth = _net_worth(a, prices) - start_worth
            if growth > best_growth:
                best_growth = growth
                best_agent = a
                best_start = start_worth
        if best_agent is not None:
            pct = (best_growth / best_start * 100.0) if best_start else 0.0
            achievements.append(
                Achievement(
                    agent_id=best_agent.id,
                    title="최고 수익률",
                    description=(
                        f"{best_agent.alias} 님이 순자산을 "
                        f"{best_growth:+,.0f}원 ({pct:+.1f}%) 늘리며 최고의 성과를 냈습니다."
                    ),
                )
            )

    return achievements


# --------------------------------------------------------------------------- #
# Overall report (FR-10)
# --------------------------------------------------------------------------- #
def build_overall_report(
    round_reports: list[RoundReport],
    agents: list[Agent],
    achievements: list[Achievement],
    endings: list[EndingResult] | None = None,
) -> OverallReport:
    """Assemble the end-of-game summary across all rounds (no emoji)."""
    endings = list(endings or [])
    markdown = _overall_markdown(round_reports, achievements, endings)
    return OverallReport(
        rounds=list(round_reports),
        achievements=list(achievements),
        endings=endings,
        markdown=markdown,
    )


def _overall_markdown(
    round_reports: list[RoundReport],
    achievements: list[Achievement],
    endings: list[EndingResult] | None = None,
) -> str:
    """Render the Korean markdown body for the overall report (no emoji)."""
    lines: list[str] = []
    lines.append("# 게임 종합 리포트")
    lines.append("")

    n = len(round_reports)
    lines.append("## 전체 요약")
    lines.append("")
    lines.append(f"총 {n} 개의 라운드가 진행되었습니다.")
    lines.append("")

    if round_reports:
        avg_fg = sum(r.fearGreedIndex for r in round_reports) / n
        avg_panic = sum(r.panicSellRatio for r in round_reports) / n
        avg_fomo = sum(r.fomoBuyRatio for r in round_reports) / n
        avg_share = sum(r.emotion_contribution_share for r in round_reports) / n
        lines.append("| 지표 | 평균 |")
        lines.append("| --- | --- |")
        lines.append(f"| 공포/탐욕 지수 | {avg_fg:.1f} |")
        lines.append(f"| 패닉셀 비율 | {avg_panic * 100:.1f}% |")
        lines.append(f"| FOMO 매수 비율 | {avg_fomo * 100:.1f}% |")
        lines.append(f"| 감정 기여도 | {avg_share * 100:.1f}% |")
        lines.append("")

        # --- Emotion contribution trend across rounds ----------------------
        lines.append("## 감정 기여도 추이")
        lines.append("")
        trend = " -> ".join(
            f"R{r.round} {r.emotion_contribution_share * 100:.0f}%"
            for r in round_reports
        )
        lines.append(trend)
        lines.append("")
        lines.append(_trend_comment(round_reports))
        lines.append("")

    # --- Endings (FR-Branch) -----------------------------------------------
    if endings:
        lines.append("## 주인공 엔딩")
        lines.append("")
        for e in endings:
            lines.append(f"- **[{e.ending_id}] {e.title}** — {e.description}")
            if e.ghost_text:
                lines.append(f"  - 그림자 분기: {e.ghost_text}")
        lines.append("")

    # --- Achievements ------------------------------------------------------
    lines.append("## 업적")
    lines.append("")
    if achievements:
        for ach in achievements:
            lines.append(f"- **{ach.title}** — {ach.description}")
    else:
        lines.append("이번 게임에서는 달성된 업적이 없습니다.")

    return "\n".join(lines)


def _trend_comment(round_reports: list[RoundReport]) -> str:
    """One-line Korean comment describing the emotion-share trend."""
    if len(round_reports) < 2:
        return "감정이 가격을 움직이는 패턴을 관찰했습니다."
    first = round_reports[0].emotion_contribution_share
    last = round_reports[-1].emotion_contribution_share
    if last > first:
        return "라운드가 진행될수록 감정이 가격에 미치는 영향이 커졌습니다."
    if last < first:
        return "라운드가 진행될수록 감정이 가격에 미치는 영향이 줄었습니다."
    return "감정이 가격에 미치는 영향이 비교적 일정하게 유지되었습니다."
