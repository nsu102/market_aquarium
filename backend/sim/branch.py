"""Ending branches — turns a protagonist's run into a fate (Detroit-style).

Three protagonists, each a different fate axis (docs/branch_design.md §10-12):
  panic_seller : 생존/공포  (E1 파산 / E2 생존 / E3 각성 / E4 잭팟)
  whale        : 확신/타이밍 (W1 역발상승리 / W2 고점물림 / W3 신중 / W4 조성자)
  fomo_trader  : 추격/탐욕   (F1 참사 / F2 잭팟 / F3 강제존버 / F4 본전)

Everything is derived from existing ``Agent`` fields per round (no extra LLM):
networth is marked-to-market with current prices so price moves show up as P&L.
``took_profit`` is a behavioural proxy: SELL while overall in profit.

Tunable thresholds live in data/ending_gates.json. Depends ONLY on sim.models +
stdlib.
"""

from __future__ import annotations

import json
from pathlib import Path

from .models import Agent, EndingResult

_GATES_PATH = Path(__file__).resolve().parents[2] / "data" / "ending_gates.json"

PROTAGONISTS = ("panic_seller", "whale", "fomo_trader")

_DEFAULT_GATES: dict = {
    "fear_zone": 30, "greed_zone": 70, "profit_mark": 1.10,
    "ghost_fear": 5, "ghost_networth": 0.08,
    "panic_seller": {"ruin_networth": 0.10, "ruin_fear": 90, "jackpot_greed": 85,
                     "jackpot_networth": 1.30, "awaken_networth": 0.70, "awaken_fear": 60},
    "whale": {"win_networth": 1.30, "caught_networth": 0.85,
              "cautious_lo": 0.90, "cautious_hi": 1.10},
    "fomo_trader": {"wipeout_networth": 0.70, "jackpot_networth": 1.30, "stuck_networth": 0.95},
}


def _load_gates() -> dict:
    try:
        return json.loads(_GATES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return _DEFAULT_GATES


G = _load_gates()

# ending_id -> (title, description, persona_mutation for a future run)
ENDING_META: dict[str, tuple[str, str, dict]] = {
    "E1": ("파산 퇴장", "공포에 휩쓸려 전 재산을 잃고 시장을 떠났다.", {"retired": True}),
    "E2": ("상처뿐인 생존", "끝까지 버텼지만 상처만 남았다.", {"default_fear_delta": 5}),
    "E3": ("가치투자 각성", "공포를 이겨내고 저가에 매수, 투자관을 바꿨다.", {"type": "value_investor"}),
    "E4": ("FOMO 잭팟→오만", "운 좋게 크게 벌었지만 오만해졌다.", {"default_greed_delta": 10}),
    "W1": ("역발상의 승리", "군중의 공포를 역이용해 대량 매집, 크게 이겼다.", {"cash_pool_scale": 1.2}),
    "W2": ("고점에 물린 고래", "탐욕에 휩쓸려 고점에 물렸다.", {"default_fear_delta": 10}),
    "W3": ("너무 신중한 고래", "기회를 앞에 두고도 끝내 움직이지 않았다.", {}),
    "W4": ("시장 조성자", "묵묵히 포지션을 지키며 장을 마쳤다.", {}),
    "F1": ("추격매수 참사", "탐욕의 고점에서 추격매수했다 크게 잃었다.", {"default_greed_delta": -10}),
    "F2": ("단타 잭팟", "추세를 제때 타고 차익을 실현했다.", {"default_greed_delta": 5}),
    "F3": ("물려서 강제 존버", "고점에 물려 어쩔 수 없이 장기투자자가 됐다.", {"type": "value_investor"}),
    "F4": ("본전치기", "분주했지만 본전 언저리에서 끝났다.", {}),
}


def _networth(a: Agent, prices: dict[str, float]) -> float:
    held = sum(h.amount * prices.get(h.asset, h.avgPrice) for h in a.portfolio)
    return a.cash + held


# --------------------------------------------------------------------------- #
# Gate functions (return ending_id). See docs/branch_design.md §3, §11, §12.
# --------------------------------------------------------------------------- #
def _ending_panic(s: dict) -> str:
    g = G["panic_seller"]
    if s["networth_pct"] <= g["ruin_networth"] and s["peak_fear"] >= g["ruin_fear"]:
        return "E1"
    if s["ever_bought"] and s["greed_peak"] >= g["jackpot_greed"] and s["networth_pct"] >= g["jackpot_networth"]:
        return "E4"
    if s["ever_bought"] and s["networth_pct"] >= g["awaken_networth"] and s["final_fear"] < g["awaken_fear"]:
        return "E3"
    return "E2"


def _ending_whale(s: dict) -> str:
    g = G["whale"]
    if s["bought_in_fear"] and s["networth_pct"] >= g["win_networth"]:
        return "W1"
    if s["bought_in_greed"] and s["networth_pct"] <= g["caught_networth"]:
        return "W2"
    if not s["ever_bought_large"] and g["cautious_lo"] <= s["networth_pct"] <= g["cautious_hi"]:
        return "W3"
    return "W4"


def _ending_fomo(s: dict) -> str:
    g = G["fomo_trader"]
    if s["bought_in_greed"] and s["networth_pct"] <= g["wipeout_networth"]:
        return "F1"
    if s["took_profit"] and s["networth_pct"] >= g["jackpot_networth"]:
        return "F2"
    if s["ever_bought"] and not s["took_profit"] and s["networth_pct"] <= g["stuck_networth"]:
        return "F3"
    return "F4"


_GATE_FN = {"panic_seller": _ending_panic, "whale": _ending_whale, "fomo_trader": _ending_fomo}


def _ghost(agent_type: str, s: dict, reached: str) -> str:
    """Nearest un-reached ending within cutoff -> 'almost' caption (else '')."""
    gf, gn = G["ghost_fear"], G["ghost_networth"]
    if agent_type == "panic_seller":
        g = G["panic_seller"]
        if reached != "E1":
            d = g["ruin_fear"] - s["peak_fear"]
            if 0 < d <= gf:
                return f"공포가 {d:.0f}만 더 높았으면 [파산 퇴장] 분기였다."
        if reached != "E3" and s["ever_bought"]:
            d = g["awaken_networth"] - s["networth_pct"]
            if 0 < d <= gn:
                return "조금만 더 버텼으면 [가치투자 각성] 분기였다."
    elif agent_type == "whale":
        g = G["whale"]
        if reached != "W1":
            d = g["win_networth"] - s["networth_pct"]
            if 0 < d <= gn and s["bought_in_fear"]:
                return f"수익 {d * 100:.0f}%만 더 났으면 [역발상의 승리] 분기였다."
    elif agent_type == "fomo_trader":
        g = G["fomo_trader"]
        if reached != "F1":
            d = s["networth_pct"] - g["wipeout_networth"]
            if 0 < d <= gn and s["bought_in_greed"]:
                return f"{d * 100:.0f}%만 더 빠졌으면 [추격매수 참사] 분기였다."
    return ""


# --------------------------------------------------------------------------- #
class ArcTracker:
    """Per-protagonist round trail -> end-of-game endings + ghosts."""

    def __init__(self, agents: list[Agent], prices: dict[str, float]):
        self.base_networth = {
            a.id: _networth(a, prices) for a in agents if a.type in PROTAGONISTS
        }
        self.trail: dict[str, list[dict]] = {
            a.id: [] for a in agents if a.type in PROTAGONISTS
        }

    def update(self, round: int, agents: list[Agent], market_fg: float,
               prices: dict[str, float]) -> None:
        for a in agents:
            if a.id not in self.trail:
                continue
            base = self.base_networth.get(a.id) or 0.0
            pct = (_networth(a, prices) / base) if base else 1.0
            self.trail[a.id].append({
                "round": round, "networth_pct": pct,
                "fear": a.fear, "greed": a.greed,
                "lastAction": a.lastAction, "market_fg": market_fg,
            })

    def arc_state(self, agent_id: str) -> dict:
        t = self.trail.get(agent_id) or []
        if not t:
            return {"networth_pct": 1.0, "min_networth_pct": 1.0, "peak_fear": 0.0,
                    "final_fear": 0.0, "greed_peak": 0.0, "ever_bought": False,
                    "ever_bought_large": False, "bought_in_fear": False,
                    "bought_in_greed": False, "took_profit": False}
        fz, gz, pm = G["fear_zone"], G["greed_zone"], G["profit_mark"]
        is_buy = lambda e: e["lastAction"] in ("BUY", "BUY_LARGE")
        return {
            "networth_pct": t[-1]["networth_pct"],
            "min_networth_pct": min(e["networth_pct"] for e in t),
            "peak_fear": max(e["fear"] for e in t),
            "final_fear": t[-1]["fear"],
            "greed_peak": max(e["greed"] for e in t),
            "ever_bought": any(is_buy(e) for e in t),
            "ever_bought_large": any(e["lastAction"] == "BUY_LARGE" for e in t),
            "bought_in_fear": any(is_buy(e) and e["market_fg"] <= fz for e in t),
            "bought_in_greed": any(is_buy(e) and e["market_fg"] >= gz for e in t),
            "took_profit": any(e["lastAction"] == "SELL" and e["networth_pct"] >= pm for e in t),
        }

    def endings(self, agents: list[Agent]) -> list[EndingResult]:
        out: list[EndingResult] = []
        for a in agents:
            if a.id not in self.trail:
                continue
            s = self.arc_state(a.id)
            ending_id = _GATE_FN[a.type](s)
            title, desc, mutation = ENDING_META[ending_id]
            out.append(EndingResult(
                agent_id=a.id, agent_alias=a.alias, agent_type=a.type,
                ending_id=ending_id, title=title,
                description=f"{a.alias} — {desc}",
                ghost_text=_ghost(a.type, s, ending_id),
                persona_mutation=mutation,
            ))
        return out
