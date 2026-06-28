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
    emotion_deltas: dict[str, dict] | None = None,
) -> RoundReport:
    """Assemble a single round's report (indices + per-asset attribution)."""
    share = emotion_contribution_share(breakdowns)
    markdown = _round_markdown(round, market, breakdowns, trades, share, agents, emotion_deltas)
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


def _fmt_delta(v: float) -> str:
    """Format a delta as +N / -N / 0 for inline display."""
    v = round(v)
    return f"+{v}" if v > 0 else str(v)


def _round_markdown(
    round: int,
    market: MarketData,
    breakdowns: list[PriceBreakdown],
    trades: list[TradeResult],
    share: float,
    agents: list[Agent] | None = None,
    emotion_deltas: dict[str, dict] | None = None,
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
        ed = emotion_deltas or {}
        lines.append("## 에이전트 지표")
        lines.append("")
        lines.append("| 에이전트 | 행동 | 종목 | 공포 | 탐욕 | 자신감 | 흥분 | 신뢰 |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
        for a in agents:
            t = trade_by_agent.get(a.id)
            action = _ACTION_KR.get(a.lastAction, a.lastAction or "-")
            symbol = (t.symbol if t and t.symbol else "-")
            d = ed.get(a.id, {})
            lines.append(
                f"| {a.alias} | {action} | {symbol}"
                f" | {a.fear:.0f}({_fmt_delta(d.get('fear', 0))})"
                f" | {a.greed:.0f}({_fmt_delta(d.get('greed', 0))})"
                f" | {a.confidence:.0f}({_fmt_delta(d.get('confidence', 0))})"
                f" | {a.excitement:.0f}({_fmt_delta(d.get('excitement', 0))})"
                f" | {a.trust:.0f}({_fmt_delta(d.get('trust', 0))}) |"
            )
        lines.append("")

    # --- Player focus section ------------------------------------------------
    if agents:
        player = next((a for a in agents if a.id == "player"), None)
        if player:
            ed = emotion_deltas or {}
            pd = ed.get("player", {})
            pt = next((t for t in trades if t.agent_id == "player"), None)
            p_action = _ACTION_KR.get(player.lastAction, player.lastAction or "-")
            lines.append("## 내 에이전트 분석")
            lines.append("")
            lines.append(f"**{player.alias}** 의 이번 라운드 행동: **{p_action}**"
                         + (f" ({pt.symbol})" if pt and pt.symbol else ""))
            lines.append("")
            lines.append("| 감정 | 현재 | 변화 |")
            lines.append("| --- | --- | --- |")
            for axis, label in [("fear", "공포"), ("greed", "탐욕"),
                                ("confidence", "자신감"), ("excitement", "흥분"),
                                ("trust", "신뢰")]:
                val = getattr(player, axis, 50)
                delta = pd.get(axis, 0)
                lines.append(f"| {label} | {val:.0f} | {_fmt_delta(delta)} |")
            lines.append("")
            # Educational insight based on player state
            lines.append(_player_insight(player, share, pt))
            lines.append("")

    # --- Trade summary -----------------------------------------------------
    lines.append("## 매매 요약")
    lines.append("")
    if trades:
        traded = [t for t in trades if t.action != Action.HOLD]
        lines.append(f"총 {len(traded)}건의 매매가 발생했습니다.")
    else:
        lines.append("이번 라운드에는 매매가 없었습니다.")

    # --- Educational message -----------------------------------------------
    lines.append("")
    lines.append("## 투자 인사이트")
    lines.append("")
    lines.append(_educational_message(share, market))

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
) -> OverallReport:
    """Assemble the end-of-game summary across all rounds (no emoji)."""
    markdown = _overall_markdown(round_reports, achievements)
    return OverallReport(
        rounds=list(round_reports),
        achievements=list(achievements),
        markdown=markdown,
    )


def _overall_markdown(
    round_reports: list[RoundReport],
    achievements: list[Achievement],
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

    # --- Achievements ------------------------------------------------------
    lines.append("## 업적")
    lines.append("")
    if achievements:
        for ach in achievements:
            lines.append(f"- **{ach.title}** — {ach.description}")
    else:
        lines.append("이번 게임에서는 달성된 업적이 없습니다.")

    return "\n".join(lines)


def _player_insight(player: Agent, share: float, trade: TradeResult | None) -> str:
    """One educational paragraph about the player's round behavior."""
    fear, greed = player.fear, player.greed
    if fear > 70 and trade and trade.action == Action.SELL:
        return (
            "높은 공포 속에서 매도를 선택했습니다. "
            "공포에 의한 매도는 손실을 확정짓는 경우가 많습니다. "
            "손절이 전략적 판단인지, 감정적 반응인지 구분하는 것이 중요합니다."
        )
    if greed > 70 and trade and trade.action in (Action.BUY, Action.BUY_LARGE):
        return (
            "높은 탐욕 상태에서 매수에 나섰습니다. "
            "FOMO에 의한 추격 매수는 고점 매수로 이어질 수 있습니다. "
            "매수 전 냉정하게 기본 가치를 점검하는 습관이 필요합니다."
        )
    if fear < 30 and greed < 30:
        return (
            "감정이 비교적 안정된 상태입니다. "
            "이런 때가 가장 이성적인 판단을 내릴 수 있는 시점입니다."
        )
    if trade and trade.action == Action.HOLD:
        return (
            "관망을 선택했습니다. 때로는 아무것도 하지 않는 것이 최선의 전략입니다. "
            "확신이 없을 때 무리하게 포지션을 잡는 것보다 낫습니다."
        )
    return (
        f"공포 {fear:.0f}, 탐욕 {greed:.0f} 상태에서 행동했습니다. "
        "자신의 감정 상태를 인지하고 매매하는 것이 감정적 손실을 줄이는 첫 걸음입니다."
    )


def _educational_message(share: float, market: MarketData) -> str:
    """Round-end educational tip based on market conditions."""
    fgi = market.fearGreedIndex
    if share > 0.4:
        return (
            "이번 라운드는 감정이 가격 변동의 주요 원인이었습니다. "
            "실제 시장에서도 뉴스 자체보다 뉴스에 대한 '반응'이 가격을 움직입니다. "
            "군중의 감정에 휩쓸리지 않고 자신만의 기준을 세우는 것이 핵심입니다."
        )
    if fgi < 30:
        return (
            "시장이 극도의 공포 상태입니다. 역사적으로 극단적 공포는 "
            "오히려 매수 기회였던 경우가 많습니다. 다만 '떨어지는 칼날'을 잡는 것과 "
            "'바닥에서 줍는 것'은 결과적으로만 구분됩니다."
        )
    if fgi > 70:
        return (
            "시장이 탐욕 상태입니다. 모두가 낙관할 때가 가장 위험한 시점일 수 있습니다. "
            "'남들이 탐욕스러울 때 두려워하라'는 격언을 기억하세요."
        )
    return (
        "시장 심리가 중립적입니다. 이런 구간에서는 감정보다 "
        "펀더멘탈과 데이터 기반의 판단이 더 나은 결과를 가져옵니다."
    )


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
