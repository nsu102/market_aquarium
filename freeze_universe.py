#!/usr/bin/env python3
"""
freeze_universe.py  —  24h 해커톤용 1회성 유니버스 고정 스크립트

큐레이션된 8섹터 시드(40종목)를 업비트 라이브 원화 마켓과 교집합하고,
미상장/상폐로 빈 슬롯을 섹터별 대체 풀에서 채운 뒤,
코인게코로 시총을 1회만 받아 섹터별 cap-weight를 계산해
universe.json 으로 덤프한다.  ★ 런타임에는 절대 재추출하지 않는다.

사용법:
    python freeze_universe.py
    COINGECKO_API_KEY=CG-xxxx python freeze_universe.py   # demo 키 있으면 안정적

코인게코가 실패해도 죽지 않고 equal-weight 로 폴백한다.
"""

import os
import json
import sys
import time
from datetime import datetime, timezone

import requests

UPBIT = "https://api.upbit.com/v1"
CG = "https://api.coingecko.com/api/v3"
VS = "krw"

# ── 큐레이션 시드: 섹터 대표성은 손으로 박는다. 종목 선별만 유동성/상장으로 거른다 ──
SEED = {
    "L1_major":     ["KRW-BTC", "KRW-ETH", "KRW-SOL", "KRW-ADA", "KRW-AVAX", "KRW-SUI"],
    "L2_scaling":   ["KRW-ARB", "KRW-OP", "KRW-POL", "KRW-STRK"],
    "DeFi":         ["KRW-UNI", "KRW-AAVE", "KRW-CRV", "KRW-COMP", "KRW-MKR"],
    "infra_oracle": ["KRW-LINK", "KRW-DOT", "KRW-ATOM", "KRW-NEAR", "KRW-GRT"],
    "payments_sov": ["KRW-XRP", "KRW-XLM", "KRW-LTC", "KRW-BCH"],
    "meme":         ["KRW-DOGE", "KRW-SHIB", "KRW-PEPE", "KRW-BONK", "KRW-WIF"],
    "ai_depin":     ["KRW-RENDER", "KRW-FET", "KRW-TAO", "KRW-AKT", "KRW-THETA"],
    "gaming_meta":  ["KRW-SAND", "KRW-MANA", "KRW-AXS", "KRW-IMX", "KRW-GALA", "KRW-FLOW"],
}

# 빈 슬롯 채울 대체 풀(상장 확인된 것만 자동 채택)
ALTERNATES = {
    "L1_major":     ["KRW-SEI", "KRW-APT", "KRW-TON"],
    "L2_scaling":   ["KRW-MNT", "KRW-ZK"],
    "DeFi":         ["KRW-SNX", "KRW-SUSHI", "KRW-PENDLE"],
    "infra_oracle": ["KRW-QNT", "KRW-ICP", "KRW-AR"],
    "payments_sov": ["KRW-ALGO", "KRW-HBAR", "KRW-TRX"],
    "meme":         ["KRW-FLOKI", "KRW-MEW"],
    "ai_depin":     ["KRW-IOTX"],
    "gaming_meta":  ["KRW-APE", "KRW-BIGTIME", "KRW-PIXEL"],
}

# 업비트 심볼 → 코인게코 id (런타임 조인 안 함, 빌드타임에 박아둔다)
# 매핑 없으면 시총 누락으로 처리되고 폴백됨. 실행 후 [unmapped] 경고 뜨면 2분만에 보정.
CG_ID = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "ADA": "cardano",
    "AVAX": "avalanche-2", "SUI": "sui", "ARB": "arbitrum", "OP": "optimism",
    "POL": "polygon-ecosystem-token", "STRK": "starknet", "UNI": "uniswap",
    "AAVE": "aave", "CRV": "curve-dao-token", "COMP": "compound-governance-token",
    "MKR": "maker", "LINK": "chainlink", "DOT": "polkadot", "ATOM": "cosmos",
    "NEAR": "near", "GRT": "the-graph", "XRP": "ripple", "XLM": "stellar",
    "LTC": "litecoin", "BCH": "bitcoin-cash", "DOGE": "dogecoin", "SHIB": "shiba-inu",
    "PEPE": "pepe", "BONK": "bonk", "WIF": "dogwifcoin", "RENDER": "render-token",
    "FET": "fetch-ai", "TAO": "bittensor", "AKT": "akash-network", "THETA": "theta-token",
    "SAND": "the-sandbox", "MANA": "decentraland", "AXS": "axie-infinity",
    "IMX": "immutable-x", "GALA": "gala", "FLOW": "flow",
    # alternates
    "SEI": "sei-network", "APT": "aptos", "TON": "the-open-network", "MNT": "mantle",
    "ZK": "zksync", "SNX": "havven", "SUSHI": "sushi", "PENDLE": "pendle",
    "QNT": "quant-network", "ICP": "internet-computer", "AR": "arweave",
    "ALGO": "algorand", "HBAR": "hedera-hashgraph", "TRX": "tron", "FLOKI": "floki",
    "MEW": "cat-in-a-dogs-world", "IOTX": "iotex", "APE": "apecoin",
    "BIGTIME": "big-time", "PIXEL": "pixels",
}

MAX_TOTAL = 40


def sym(market):
    return market.split("-", 1)[1]


def fetch_live_krw_markets():
    """업비트 라이브 원화 마켓 코드 집합."""
    r = requests.get(f"{UPBIT}/market/all", params={"is_details": "true"}, timeout=10)
    r.raise_for_status()
    live = set()
    for m in r.json():
        code = m.get("market", "")
        if code.startswith("KRW-"):
            live.add(code)
    return live


def resolve_sectors(live):
    """시드를 라이브와 교집합 → 빈 슬롯을 대체 풀로 refill → 전역 dedupe/cap."""
    seen = set()
    resolved = {}
    dropped = []
    for sector, members in SEED.items():
        target = len(members)
        picked = []
        for mk in members:
            if mk in live and mk not in seen:
                picked.append(mk); seen.add(mk)
            elif mk not in live:
                dropped.append(mk)
        # refill
        for alt in ALTERNATES.get(sector, []):
            if len(picked) >= target:
                break
            if alt in live and alt not in seen:
                picked.append(alt); seen.add(alt)
        resolved[sector] = picked

    # 전역 40 cap (시드 합이 40이라 보통 안 걸리지만 안전장치)
    total = sum(len(v) for v in resolved.values())
    if total > MAX_TOTAL:
        over = total - MAX_TOTAL
        for sector in sorted(resolved, key=lambda s: len(resolved[s]), reverse=True):
            while over > 0 and len(resolved[sector]) > 3:
                resolved[sector].pop(); over -= 1
            if over == 0:
                break
    return resolved, dropped


def fetch_market_caps(markets):
    """코인게코로 시총 1회 조회. 실패 시 {} 반환(→ equal weight 폴백)."""
    ids, id2mk = [], {}
    for mk in markets:
        cgid = CG_ID.get(sym(mk))
        if cgid:
            ids.append(cgid); id2mk[cgid] = mk
    if not ids:
        return {}
    headers = {}
    key = os.getenv("COINGECKO_API_KEY")
    if key:
        headers["x-cg-demo-api-key"] = key
    try:
        r = requests.get(
            f"{CG}/coins/markets",
            params={"vs_currency": VS, "ids": ",".join(ids), "per_page": 250, "page": 1},
            headers=headers, timeout=15,
        )
        r.raise_for_status()
        caps = {}
        for row in r.json():
            mk = id2mk.get(row["id"])
            if mk and row.get("market_cap"):
                caps[mk] = float(row["market_cap"])
        return caps
    except Exception as e:
        print(f"[warn] coingecko 시총 조회 실패 → equal weight 폴백: {e}", file=sys.stderr)
        return {}


def cap_weights(members, caps):
    """섹터 내 cap-normalize. 일부 누락은 섹터 중앙값으로 채움. 전부 누락이면 equal."""
    vals = [caps[m] for m in members if m in caps]
    if not vals:
        w = round(1.0 / len(members), 6) if members else 0
        return {m: w for m in members}
    import statistics
    med = statistics.median(vals)
    filled = {m: caps.get(m, med) for m in members}
    total = sum(filled.values())
    return {m: round(filled[m] / total, 6) for m in members}


def main():
    print("업비트 라이브 원화 마켓 조회 …")
    live = fetch_live_krw_markets()
    print(f"  원화 마켓 {len(live)}개")

    resolved, dropped = resolve_sectors(live)
    flat = [m for ms in resolved.values() for m in ms]
    if dropped:
        print(f"[drop] 미상장으로 제외: {', '.join(dropped)}")

    unmapped = [m for m in flat if sym(m) not in CG_ID]
    if unmapped:
        print(f"[unmapped] 코인게코 id 없음(가중치 폴백): {', '.join(unmapped)}")

    print("코인게코 시총 1회 조회 …")
    caps = fetch_market_caps(flat)

    sectors_out = {}
    for sector, members in resolved.items():
        w = cap_weights(members, caps)
        sectors_out[sector] = [
            {
                "market": m,
                "symbol": sym(m),
                "coingecko_id": CG_ID.get(sym(m)),
                "market_cap": caps.get(m),
                "weight": w[m],
            }
            for m in members
        ]

    universe = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "vs_currency": VS,
        "weighting": "cap_weighted" if caps else "equal_fallback",
        "total": len(flat),
        "markets": flat,
        "sectors": sectors_out,
    }

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "universe.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(universe, f, ensure_ascii=False, indent=2)

    print(f"\n✓ {len(flat)}종목 / {len(sectors_out)}섹터 → {out}")
    for sector, items in sectors_out.items():
        line = ", ".join(f"{it['symbol']}({it['weight']:.0%})" for it in items)
        print(f"  {sector:13s}: {line}")


if __name__ == "__main__":
    main()
