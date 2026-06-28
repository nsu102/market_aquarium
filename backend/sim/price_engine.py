"""FR-7: price engine.

The model is still intentionally lightweight (no real order book), but it tries
to avoid the "everything moves together" feel. A market-wide event is filtered
through each asset's sector beta, liquidity, recent trend, and idiosyncratic
noise. The percentage change is still reported as four components so the round
report can attribute the move to its causes:

    price_change_pct = event_impact + order_pressure + emotion_overheat + noise

This module depends ONLY on sim.models and the stdlib (no other sim modules).
"""

from __future__ import annotations

import random
import re

from .models import Action, Agent, Asset, PriceBreakdown, TradeResult

# --------------------------------------------------------------------------- #
# Coefficients (module-level defaults, overridable via the `coefficients` arg).
# Keep the components in a "sane" single/low-double-digit % range.
# --------------------------------------------------------------------------- #
DEFAULT_COEFFICIENTS: dict[str, float] = {
    # event_impact_pct is already a %, so 1.0 passes it through unchanged.
    "event_scale": 1.0,
    # asset-specific event rotation: higher = more cross-sectional dispersion.
    "event_dispersion": 0.32,
    # order_pressure: % per unit of cash-weighted net buy ratio (-1..1 -> %).
    "order_scale": 5.0,
    # BUY_LARGE moves price this many times harder than a plain BUY.
    "buy_large_weight": 2.5,
    # emotion_overheat: (mean_greed - mean_fear) is in -100..100; scale to %.
    "emotion_scale": 0.035,
    # noise: deterministic uniform in +/- this many %.
    "noise_amplitude": 0.55,
    # recent trend-following and overshoot correction, folded into noise.
    "momentum_scale": 0.12,
    "mean_reversion_scale": 0.20,
    # Directly mentioned assets should react more to their own news.
    "direct_event_multiplier": 1.85,
    # Keep the headline direction visible for directly mentioned assets.
    "direct_event_min_move": 0.25,
    # sanity cap for one simulated round. Per-asset volatility can widen this.
    "max_abs_move": 14.0,
}


SECTOR_VOLATILITY: dict[str, float] = {
    "L1_major": 0.72,
    "L2_scaling": 1.18,
    "DeFi": 1.12,
    "infra_oracle": 1.00,
    "payments_sov": 0.86,
    "meme": 1.85,
    "ai_depin": 1.38,
    "gaming_meta": 1.45,
}

SECTOR_EVENT_BETA: dict[str, float] = {
    "L1_major": 0.72,
    "L2_scaling": 1.08,
    "DeFi": 0.98,
    "infra_oracle": 0.92,
    "payments_sov": 0.78,
    "meme": 1.30,
    "ai_depin": 1.18,
    "gaming_meta": 1.10,
}

SYMBOL_VOLATILITY: dict[str, float] = {
    "BTC": 0.42,
    "ETH": 0.58,
    "SOL": 0.84,
    "XRP": 0.72,
    "DOGE": 1.45,
    "SHIB": 1.90,
    "PEPE": 2.05,
    "BONK": 2.00,
    "WIF": 1.95,
}

SYMBOL_EVENT_BETA: dict[str, float] = {
    "BTC": 0.58,
    "ETH": 0.70,
    "SOL": 0.96,
    "XRP": 0.72,
    "DOGE": 1.22,
    "SHIB": 1.45,
    "PEPE": 1.55,
    "BONK": 1.50,
    "WIF": 1.48,
}

TARGET_EVENT_ALIASES: dict[str, tuple[str, ...]] = {
    "BTC": ("bitcoin", "비트코인"),
    "ETH": ("ethereum", "이더리움"),
    "SOL": ("solana", "솔라나"),
    "XRP": ("ripple", "리플"),
    "DOGE": ("dogecoin", "도지", "도지코인"),
    "SHIB": ("shiba", "shiba inu", "시바", "시바이누"),
    "PEPE": ("페페",),
    "BONK": ("봉크",),
    "WIF": ("dogwifhat", "도그위프햇"),
}


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _stable_seed(seed: int, symbol: str, salt: str) -> int:
    """Stable cross-process seed; avoids Python's randomized hash()."""
    acc = (seed + 1) * 1_000_003
    for ch in f"{symbol}:{salt}":
        acc = (acc * 131 + ord(ch)) % (2**32)
    return acc


def _coef(coefficients: dict | None, key: str) -> float:
    """Resolve a coefficient, falling back to the module default."""
    if coefficients and key in coefficients:
        return float(coefficients[key])
    return float(DEFAULT_COEFFICIENTS[key])


def _liquidity_multiplier(asset: Asset) -> float:
    """Low-liquidity assets should absorb the same shock with larger moves."""
    volume = max(float(asset.volume or 0.0), 1_000_000_000.0)
    # Around 50B KRW/day is treated as a medium-liquid coin in this universe.
    return _clamp((50_000_000_000.0 / volume) ** 0.16, 0.72, 1.55)


def _asset_volatility(asset: Asset) -> float:
    sector_v = SECTOR_VOLATILITY.get(asset.sector, 1.12)
    symbol_v = SYMBOL_VOLATILITY.get(asset.symbol, sector_v)
    return _clamp(symbol_v * _liquidity_multiplier(asset), 0.35, 2.25)


def _event_beta(asset: Asset, seed: int, coefficients: dict | None) -> float:
    """Asset-specific sensitivity to a shared event.

    The small deterministic rotation is what prevents every symbol from taking
    the exact same event shock each round.
    """
    beta = SYMBOL_EVENT_BETA.get(
        asset.symbol,
        SECTOR_EVENT_BETA.get(asset.sector, 1.0),
    )
    rng = random.Random(_stable_seed(seed, asset.symbol, "event"))
    dispersion = _coef(coefficients, "event_dispersion")
    rotation = rng.uniform(-dispersion, dispersion)
    return _clamp(beta + rotation, 0.18, 1.90)


def _has_symbol_token(text: str, symbol: str) -> bool:
    if not symbol:
        return False
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(symbol.lower())}(?![a-z0-9])", text))


def _direct_event_target(asset: Asset, event_text: str) -> bool:
    """Whether the event text points at this exact asset, not just the market."""
    text = event_text.lower()
    if not text:
        return False

    symbol = asset.symbol or ""
    if _has_symbol_token(text, symbol):
        return True

    names = []
    if asset.name and asset.name != symbol:
        names.append(asset.name)
    names.extend(TARGET_EVENT_ALIASES.get(symbol.upper(), ()))
    return any(name and name.lower() in text for name in names)


def _order_pressure(
    asset: Asset,
    agents: list[Agent],
    trades: list[TradeResult],
    coefficients: dict | None,
) -> float:
    """Liquidity-aware net buy/sell pressure for an asset, mapped to a %.

    Real trade results carry qty*price, which is compared to the asset's daily
    volume. Older tests and fallback paths may omit qty/price; those keep the
    previous cash-weighted behaviour.
    """
    symbol = asset.symbol
    if not symbol:
        return 0.0

    cash_by_agent = {a.id: max(0.0, a.cash) for a in agents}
    buy_large_w = _coef(coefficients, "buy_large_weight")

    signed = 0.0
    magnitude = 0.0
    used_trade_value = False
    for t in trades:
        if t.symbol != symbol:
            continue
        trade_value = abs(float(t.qty or 0.0) * float(t.price or 0.0))
        base = trade_value if trade_value > 0 else cash_by_agent.get(t.agent_id, 0.0)
        used_trade_value = used_trade_value or trade_value > 0
        if base <= 0:
            continue
        if t.action == Action.BUY:
            w = base
        elif t.action == Action.BUY_LARGE:
            w = base * buy_large_w
        elif t.action == Action.SELL:
            w = -base
        else:  # HOLD or anything else exerts no pressure
            continue
        signed += w
        magnitude += abs(w)

    if magnitude <= 0:
        return 0.0

    net_ratio = signed / magnitude  # in [-1, 1]
    if not used_trade_value:
        return net_ratio * _coef(coefficients, "order_scale") * _asset_volatility(asset)

    volume = max(float(asset.volume or 0.0), 1_000_000_000.0)
    participation = _clamp(magnitude / volume, 0.0, 0.12) / 0.12
    return (
        net_ratio
        * _coef(coefficients, "order_scale")
        * participation
        * _asset_volatility(asset)
    )


def _emotion_overheat(
    asset: Asset,
    agents: list[Agent],
    seed: int,
    coefficients: dict | None,
) -> float:
    """Aggregate greed-vs-fear pressure filtered by the asset's risk profile."""
    if not agents:
        return 0.0
    mean_greed = sum(a.greed for a in agents) / len(agents)
    mean_fear = sum(a.fear for a in agents) / len(agents)
    rng = random.Random(_stable_seed(seed, asset.symbol, "emotion"))
    crowd_rotation = rng.uniform(0.82, 1.18)
    return (
        (mean_greed - mean_fear)
        * _coef(coefficients, "emotion_scale")
        * _asset_volatility(asset)
        * crowd_rotation
    )


def _recent_move(asset: Asset, lookback: int = 3) -> float:
    """Recent percentage move over the available history window."""
    hist = [float(x) for x in asset.priceHistory if float(x) > 0]
    if len(hist) < 2:
        return 0.0
    window = hist[-(lookback + 1):]
    if len(window) < 2 or window[0] <= 0:
        return 0.0
    return (window[-1] / window[0] - 1.0) * 100.0


def _last_return(asset: Asset) -> float:
    hist = [float(x) for x in asset.priceHistory if float(x) > 0]
    if len(hist) < 2 or hist[-2] <= 0:
        return 0.0
    return (hist[-1] / hist[-2] - 1.0) * 100.0


def _noise(asset: Asset, seed: int, coefficients: dict | None) -> float:
    """Deterministic idiosyncratic noise + trend/mild mean reversion."""
    rng = random.Random(_stable_seed(seed, asset.symbol, "noise"))
    vol = _asset_volatility(asset)
    amp = _coef(coefficients, "noise_amplitude") * vol
    idiosyncratic = rng.uniform(-amp, amp)

    momentum = _last_return(asset) * _coef(coefficients, "momentum_scale")
    recent = _recent_move(asset)
    threshold = 1.4 * vol
    overshoot = max(0.0, abs(recent) - threshold)
    mean_reversion = -1.0 * (1 if recent > 0 else -1) * overshoot * _coef(
        coefficients, "mean_reversion_scale"
    )
    return idiosyncratic + momentum + mean_reversion


def _cap_move(total_pct: float, asset: Asset, coefficients: dict | None) -> float:
    cap = _coef(coefficients, "max_abs_move") * _clamp(_asset_volatility(asset), 0.55, 1.75)
    return _clamp(total_pct, -cap, cap)


def compute_price_change(
    asset: Asset,
    event_impact_pct: float,
    agents: list[Agent],
    trades: list[TradeResult],
    seed: int,
    coefficients: dict | None = None,
    event_text: str = "",
) -> PriceBreakdown:
    """Compute the four-component price change for a single asset (FR-7).

    Returns a PriceBreakdown; it does not mutate the asset (see apply_breakdown).
    """
    direct_event_target = _direct_event_target(asset, event_text)
    event_multiplier = (
        _coef(coefficients, "direct_event_multiplier") if direct_event_target else 1.0
    )
    event_impact = (
        event_impact_pct
        * _coef(coefficients, "event_scale")
        * _event_beta(asset, seed, coefficients)
        * event_multiplier
    )
    order_pressure = _order_pressure(asset, agents, trades, coefficients)
    emotion_overheat = _emotion_overheat(asset, agents, seed, coefficients)
    noise = _noise(asset, seed, coefficients)

    raw_total_pct = event_impact + order_pressure + emotion_overheat + noise
    min_direct_move = abs(_coef(coefficients, "direct_event_min_move"))
    if direct_event_target and event_impact < 0 and raw_total_pct > -min_direct_move:
        noise += -min_direct_move - raw_total_pct
        raw_total_pct = -min_direct_move
    elif direct_event_target and event_impact > 0 and raw_total_pct < min_direct_move:
        noise += min_direct_move - raw_total_pct
        raw_total_pct = min_direct_move

    total_pct = _cap_move(raw_total_pct, asset, coefficients)
    if total_pct != raw_total_pct:
        # Keep the public contract true: components sum to total_pct. Treat the
        # cap as a market microstructure shock absorbed in the noise bucket.
        noise += total_pct - raw_total_pct

    old_price = asset.price
    new_price = old_price * (1 + total_pct / 100.0)
    new_price = max(0.0, round(new_price, 4))  # price never goes negative

    return PriceBreakdown(
        symbol=asset.symbol,
        event_impact=event_impact,
        order_pressure=order_pressure,
        emotion_overheat=emotion_overheat,
        noise=noise,
        total_pct=total_pct,
        old_price=old_price,
        new_price=new_price,
    )


def apply_breakdown(asset: Asset, b: PriceBreakdown) -> None:
    """Mutate `asset` in place with the computed breakdown."""
    asset.price = b.new_price
    asset.priceHistory.append(b.new_price)
    asset.change24h = b.total_pct


def apply_breakdowns(assets: list[Asset], breakdowns: list[PriceBreakdown]) -> None:
    """Apply each breakdown to its matching asset (by symbol)."""
    by_symbol = {a.symbol: a for a in assets}
    for b in breakdowns:
        asset = by_symbol.get(b.symbol)
        if asset is not None:
            apply_breakdown(asset, b)
