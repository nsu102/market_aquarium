# 분기 설계 — 선택 카드 × 주인공 에이전트 운명 (Detroit식)

> 목적: 이벤트를 **선택 카드(+와일드카드 1장)**로 바꾸고, **주인공 에이전트의 운명**에
> 분기·엔딩을 걸어 "고정 라운드 → 엔딩 달성 → 반복 플레이"를 만든다.
> 대상 독자: FE(윤수) / BE(정오). 아래 스키마는 바로 구현 가능한 형태로 작성했다.

## 0. 설계 원칙 (수술적·재사용 우선)

1. **감정→가격은 기존 sim이 계산한다.** 카드는 글로벌 이벤트(텍스트·충격·루머여부)만
   주입하고, poignancy/emotion/price_engine은 손대지 않는다.
2. **운명은 새 메터 없이 기존 `Agent` 필드에서 파생한다.** (`fear`/`greed`/`lastAction`/
   `cash`/`portfolio`) → 추가 LLM 호출 0, 추가 토큰 0.
3. **Ghost 분기는 재시뮬 없이** 라운드별 로깅값의 "임계 근접"으로만 판정한다.
4. 신규 작업의 무게중심은 **코드가 아니라 데이터(카드 덱 JSON + 게이트 조건)**다.

---

## 1. EventCard 스키마 (신규 데이터)

카드를 고르면 기존 `GameEvent`(`frontend/mock_data/events.ts`) 1건을 emit 한다.
즉 EventCard = GameEvent + 분기 메타.

```jsonc
// data/cards.json
{
  "id": "card_hack_rumor",
  "title": "거래소 해킹 루머",            // 카드 앞면(짧게)
  "text": "대형 거래소 해킹 소식이 퍼졌다", // → GameEvent.text
  "impact": "negative",                  // → GameEvent.impact (positive|negative|neutral)
  "is_rumor": true,                      // → Event.is_rumor (신뢰도/크레더빌리티 경로)
  "base_shock": -2.7,                    // price_engine 이벤트항 시드(%) ※ 유일한 BE 접점
  "rounds": [1, 2, 3],                   // 등장 가능 라운드
  "tags": ["fear", "rumor"],             // 덱 필터/연출용
  "locks":   ["card_authority_denial"],  // 선택 시 "다음 라운드" 비활성화될 카드들
  "unlocks": ["card_more_leak"]          // 선택 시 "다음 라운드" 활성화될 카드들
}
```

emit 시 매핑:
```
GameEvent { id: uuid, round, text: card.text, source: "user",
            impact: card.impact, timestamp: now }
Event.is_rumor      = card.is_rumor
price_engine 이벤트항 = card.base_shock   // 기존엔 impact로 추정 → base_shock로 명시화
```

### 와일드카드 (sandbox 잔존)
라운드당 1장은 free-text. `source:"user"`, `impact`는 기존 LLM 판정,
`is_rumor:true` 가정. 분기맵엔 `?` 노드로 삽입(잠금규칙 없음).

### 덱 진행 규칙 (FE 상태머신)
```
deck_round(N) = { c | N in c.rounds }
              − Σ locks(선택카드들, ~N)      // 이전 선택이 잠근 카드 제외
              + Σ unlocks(선택카드들, ~N)     // 이전 선택이 연 카드 포함
매 라운드 이 집합에서 2~3장 제시 + 와일드카드 1장.
```

---

## 2. ArcState 추적기 (BE, 라운드 종료마다 갱신)

주인공(키 에이전트)별로만 유지. 전부 기존 `Agent` 필드에서 파생.

```python
networth(a)  = a.cash + sum(h.amount * price(h.asset) for h in a.portfolio)

arc_state[agent_id] = {
  "networth_pct":     networth(a) / networth_round0(a),   # 시작=1.0
  "min_networth_pct": min over rounds,
  "peak_fear":        max(a.fear over rounds),
  "final_fear":       a.fear,                              # 마지막 라운드
  "greed_peak":       max(a.greed over rounds),
  "ever_bought":      any(a.lastAction in {"BUY","BUY_LARGE"} over rounds),
  "trail":            [{round, networth_pct, fear, lastAction}, ...]  # ghost/맵용
}
```

`networth_round0` 는 게임 시작(시드 직후) 1회 캡처.

---

## 3. 엔딩 게이트 — 패닉셀 개미 (`type == "panic_seller"`)

최종 라운드에 **우선순위 순으로** 첫 매칭 엔딩 확정.

| # | 엔딩 | 조건 (우선순위 위→아래) | 영구 결과 |
|---|---|---|---|
| E1 | 파산 퇴장 | `networth_pct ≤ 0.10` **and** `peak_fear ≥ 90` | 다음 판 시드에서 **영구 제외** |
| E4 | FOMO 잭팟→오만 | `ever_bought` **and** `greed_peak ≥ 85` **and** `networth_pct ≥ 1.30` | 다음 판 `default_greed += 10` |
| E3 | 가치투자 각성 | `ever_bought` **and** `networth_pct ≥ 0.70` **and** `final_fear < 60` | `type → "value_investor"` 전향 |
| E2 | 상처뿐인 생존 | (그 외 전부 = default) | 다음 판 `default_fear += 5` |

```python
def ending_panic_seller(s):
    if s["networth_pct"] <= 0.10 and s["peak_fear"] >= 90:        return "E1"
    if s["ever_bought"] and s["greed_peak"] >= 85 and s["networth_pct"] >= 1.30: return "E4"
    if s["ever_bought"] and s["networth_pct"] >= 0.70 and s["final_fear"] < 60:  return "E3"
    return "E2"
```

> 임계값(0.10 / 0.70 / 1.30 / 90 / 85 / 60)은 **플레이테스트로 보정할 튜닝 상수**다.
> 별도 `data/ending_gates.json`으로 빼서 코드 수정 없이 조정 가능하게 권장.

---

## 4. Ghost 분기 (재시뮬 없음)

엔딩 화면에서 **도달 못 한 엔딩 중 가장 가까웠던 1개**를 회색으로 표시.
거리(distance)는 게이트 임계와의 차이로 계산, 임계 근접(아래 cutoff)일 때만 노출.

```python
# 예: 실제 엔딩이 E2일 때
ghosts = []
if not reached("E1"):
    d = 90 - s["peak_fear"]                  # 공포 부족분
    if 0 < d <= 5: ghosts.append(("E1", f"공포가 {d:.0f}만 더 높았으면 [파산] 분기였다"))
if not reached("E3"):
    d = 0.70 - s["min_networth_pct"]         # 저점 매수 여력
    if s["ever_bought"] and 0 < d <= 0.08:
        ghosts.append(("E3", "한 번만 더 버텼으면 [가치투자 각성] 분기였다"))
show = min(ghosts, key=distance)             # 가장 가까운 1개
```

cutoff(fear 5 / networth 0.08)도 `ending_gates.json`에 둔다.

---

## 5. 엔딩 영구 결과 (Detroit "되돌릴 수 없음")

다음 판 시드(`Persona`/세팅)에 반영 → 같은 캐릭이 다르게 시작:

- **E1 파산**: 해당 persona를 다음 게임 에이전트 풀에서 제외(또는 `retired:true`).
  패닉셀러 1명 감소 → 시장 역학 변화.
- **E3 각성**: `Agent.type`(및 다음 판 `Persona.type`) `panic_seller → value_investor`.
- **E2/E4**: `default_fear`/`default_greed` 소폭 가감(위 표).

### 모델 매핑 (재사용)
MVP는 기존 `Achievement{agent_id,title,description}`(`backend/sim/models.py:295`)을
엔딩 표면화에 재사용:
```python
Achievement(agent_id="panic_seller",
            title="가치투자 각성",
            description="공포를 이겨내고 저가에 매수, 투자관을 바꿨다")
```
영구 결과 플래그가 필요하면 `OverallReport`에 선택 필드 1개만 추가 권장:
```python
class EndingResult(BaseModel):
    agent_id: str
    ending_id: str            # "E1".."E4"
    title: str
    persona_mutation: dict = {}   # {"retired": true} | {"type": "value_investor"} | {"default_greed_delta": 10}
# OverallReport.endings: list[EndingResult] = []
```

---

## 6. FE — 분기맵(Emotion Flowchart) 컴포넌트 계약

신규 `frontend/components/BranchMap.tsx`. 라운드 종료마다 노드 1칸 점등.

```ts
interface BranchNode {
  round: number;
  state: "안정"|"불안"|"패닉"|"투항"|"존버"|"각성"|"FOMO";  // arc_state로 분류
  reached: boolean;              // 점등 / 회색
  cardChosen?: string;           // 이 칸에서 고른 카드 title
  label: string;                 // 노드 캡션
}
interface BranchMapProps {
  nodes: BranchNode[];           // 내가 간 길
  ghost?: { endingId: string; text: string };  // §4 결과(있으면 회색 분기)
  endings: EndingResult[];       // 도감 채움용
}
```
- 노드 상태 분류는 `arc_state.trail`로 FE/BE 어느 쪽이든 가능(권장: BE가 분류해 내려줌).
- 엔딩 화면: 확정 엔딩 강조 + ghost 1개 회색 + "엔딩 도감 n/4" 카운터.

---

## 7. 구현 Touchpoints

**재사용(수정 없음)**: price_engine, poignancy/emotion, `Agent`/`Event`/`GameEvent`,
`Achievement`/`OverallReport`, 라운드 로깅.

**신규/수정**:
| 영역 | 파일 | 작업 |
|---|---|---|
| 데이터 | `data/cards.json`, `data/ending_gates.json` | 카드 덱 + 게이트/cutoff 상수 |
| BE | `backend/sim/` (신규 `branch.py`) | ArcState 추적, 엔딩 게이트, ghost 판정 |
| BE | price_engine 진입부 | 이벤트항을 `impact` 추정 → `card.base_shock` 사용(1줄) |
| BE | `models.py` | (선택) `EndingResult` + `OverallReport.endings` |
| FE | `BranchMap.tsx`(신규) | 분기맵/엔딩/도감 |
| FE | 이벤트 입력 UI | free-text → 카드 2~3장 + 와일드카드 1장 |

---

## 8. 리스크 / 트레이드오프

- **덱 빈약 = 분기 고갈.** 주인공 1명 × 4엔딩을 깊게(vertical slice) 채우는 게
  8명 얕게 까는 것보다 데모 임팩트 큼.
- **임계값 튜닝 의존.** 게이트가 안 맞으면 항상 같은 엔딩만 → `ending_gates.json`로
  플레이테스트 보정 필수.
- **카드화 ↔ sandbox 자유도 트레이드오프.** 와일드카드 1장으로 일부 상쇄(수용됨).
- **풀 counterfactual은 비용**이라 제외, "near-miss ghost"까지만(MVP).

---

## 9. 샘플 덱 — 패닉셀 개미 한 줄기 (R1→R5)

```jsonc
// data/cards.json (발췌)
[
  { "id":"card_hack_rumor", "title":"거래소 해킹 루머", "text":"대형 거래소 해킹 소식이 퍼졌다",
    "impact":"negative", "is_rumor":true, "base_shock":-2.7, "rounds":[1,2,3],
    "tags":["fear","rumor"], "locks":["card_authority_denial"], "unlocks":["card_more_leak"] },

  { "id":"card_authority_denial", "title":"당국, 루머 부인", "text":"금융당국이 해킹 루머를 공식 부인했다",
    "impact":"positive", "is_rumor":false, "base_shock":0.5, "rounds":[1,2],
    "tags":["calm"], "locks":[], "unlocks":["card_dip_buy"] },

  { "id":"card_more_leak", "title":"추가 폭로", "text":"해킹 규모가 예상보다 크다는 2차 폭로가 나왔다",
    "impact":"negative", "is_rumor":true, "base_shock":-4.1, "rounds":[2,3],
    "tags":["fear","panic"], "locks":["card_dip_buy"], "unlocks":[] },

  { "id":"card_dip_buy", "title":"저가매수 기회", "text":"과매도 구간이라는 분석이 퍼졌다",
    "impact":"positive", "is_rumor":false, "base_shock":1.2, "rounds":[3,4],
    "tags":["greed","contrarian"], "locks":[], "unlocks":["card_vrebound"] },

  { "id":"card_vrebound", "title":"V자 반등", "text":"고래들의 대량 매집이 포착됐다",
    "impact":"positive", "is_rumor":false, "base_shock":3.0, "rounds":[4,5],
    "tags":["greed"], "locks":[], "unlocks":[] },

  { "id":"card_capitulation", "title":"투매 가속", "text":"손절 물량이 쏟아지며 호가가 비었다",
    "impact":"negative", "is_rumor":false, "base_shock":-3.5, "rounds":[3,4,5],
    "tags":["panic"], "locks":[], "unlocks":[] }
]
```

**경로 예시**
- `해킹루머(R1)→추가폭로(R2)→투매가속(R3)` ⇒ peak_fear↑, networth↓ ⇒ **E1 파산**
- `당국부인(R1)→저가매수(R3)→V자반등(R4)` ⇒ ever_bought, networth≥0.7, fear진정 ⇒ **E3 각성**
  (단 R1에 해킹루머를 골랐다면 당국부인이 lock 되어 이 줄기는 그 판에 닫힘)

---

## 10. 주인공 로스터 (3명) + ArcState 확장

기본 로스터(`DEFAULT_PERSONA_IDS`)에 있는 3명만 주인공으로 쓴다.
음모론 인플루언서(`conspiracy`)는 현재 프로덕트 제외 → 주인공 아님.

| 주인공 | persona_id | 운명 축 | 한 줄 |
|---|---|---|---|
| 패닉셀 개미 | `panic` | 생존/순자산 (공포) | 공포에 팔다 파산 vs 버텨서 각성 (§3) |
| 매크로 고래 | `whale` | 확신/타이밍 | **공포 국면에 사면 승리**, 탐욕에 사면 물림 |
| FOMO 단타러 | `fomo` | 추격/타이밍 | **탐욕 국면에 사면 참사**, 추세 타면 잭팟 |

세 캐릭 모두 순자산 축이라 §2 ArcState 기계를 공유한다. 단 "어느 국면에서
샀는가"가 핵심이라 **국면 신호 4개를 추가**한다 (전부 기존값 파생, 토큰 0):

```python
# §2 arc_state[agent_id] 에 추가
# market_fg(r) = RoundReport[r].fearGreedIndex  (0..100, 높을수록 탐욕; ≤30 공포·≥70 탐욕)
"ever_bought_large": any(lastAction == "BUY_LARGE" over rounds),
"bought_in_fear":    any(r: lastAction in {"BUY","BUY_LARGE"} and market_fg(r) <= 30),
"bought_in_greed":   any(r: lastAction in {"BUY","BUY_LARGE"} and market_fg(r) >= 70),
"took_profit":       any(SELL with TradeResult.price > holding.avgPrice),
```
> `lastAction`은 라운드별 1개라 `arc_state.trail[r].lastAction` 으로 라운드↔국면 매칭.
> 국면 임계(30/70)도 `ending_gates.json` 으로 분리.

---

## 11. 엔딩 게이트 — 매크로 고래 (`type == "whale"`)

고래는 현금이 크고 `default_fear=10`. **군중 공포를 역이용해 BUY_LARGE** 하면 이긴다.

| # | 엔딩 | 조건 (우선순위 위→아래) | 영구 결과 |
|---|---|---|---|
| W1 | 역발상의 승리 | `bought_in_fear` **and** `networth_pct ≥ 1.30` | 다음 판 `cash_pool` 상향(더 큰 고래) |
| W2 | 고점에 물린 고래 | `bought_in_greed` **and** `networth_pct ≤ 0.85` | 다음 판 `default_fear += 10` |
| W3 | 너무 신중한 고래 | **not** `ever_bought_large` **and** `0.90 ≤ networth_pct ≤ 1.10` | (없음) |
| W4 | 시장 조성자 | (그 외 = default) | (없음) |

```python
def ending_whale(s):
    if s["bought_in_fear"]  and s["networth_pct"] >= 1.30:  return "W1"
    if s["bought_in_greed"] and s["networth_pct"] <= 0.85:  return "W2"
    if not s["ever_bought_large"] and 0.90 <= s["networth_pct"] <= 1.10: return "W3"
    return "W4"
```

**경로 예시**
- `해킹루머(R1, 공포)→[고래 BUY_LARGE]→V자반등(R4)` ⇒ bought_in_fear, networth≥1.3 ⇒ **W1**
- `밈광풍(R2, 탐욕)→[고래 추격 BUY_LARGE]→밈붕괴(R3)` ⇒ bought_in_greed, networth≤0.85 ⇒ **W2**

---

## 12. 엔딩 게이트 — FOMO 단타러 (`type == "fomo"`)

`default_greed=90`, `herd_sensitivity=0.85`. **탐욕 국면(고점)에 추격매수**하면 참사.
고래의 거울상(공포에 사는 고래 ↔ 탐욕에 사는 FOMO).

| # | 엔딩 | 조건 (우선순위 위→아래) | 영구 결과 |
|---|---|---|---|
| F1 | 추격매수 참사 | `bought_in_greed` **and** `networth_pct ≤ 0.70` | 다음 판 `default_greed −= 10` (데임) |
| F2 | 단타 잭팟 | `took_profit` **and** `networth_pct ≥ 1.30` | 다음 판 `default_greed += 5` (오만) |
| F3 | 물려서 강제 존버 | `ever_bought` **and not** `took_profit` **and** `networth_pct ≤ 0.95` | `type → "value_investor"` 전향(강제 장투) |
| F4 | 본전치기 | (그 외 = default) | (없음) |

```python
def ending_fomo(s):
    if s["bought_in_greed"] and s["networth_pct"] <= 0.70:  return "F1"
    if s["took_profit"]     and s["networth_pct"] >= 1.30:  return "F2"
    if s["ever_bought"] and not s["took_profit"] and s["networth_pct"] <= 0.95: return "F3"
    return "F4"
```
> F3 전향은 §3 패닉셀 개미 E3(각성)의 거울상 — "탐욕에 물려 어쩔 수 없이 장투자가
> 된다"는 아이러니. 둘 다 `value_investor`로 수렴하지만 서사가 정반대.

**경로 예시**
- `유명인떡상(R2)→밈광풍(R3, 탐욕)→[FOMO 추격]→밈붕괴(R4)` ⇒ bought_in_greed, networth≤0.7 ⇒ **F1**
- `ETF유입(R1)→[FOMO 조기진입]→사상최고가(R3)→[차익실현 SELL]` ⇒ took_profit, networth≥1.3 ⇒ **F2**

### Ghost (공통 §4 패턴 재사용) 예시
- 고래: `networth_pct=1.22` (W1 게이트 1.30) → "수익 8%만 더 났으면 [역발상의 승리]였다"
- FOMO: `networth_pct=0.74` (F1 게이트 0.70) → "4%만 더 빠졌으면 [추격매수 참사]였다"

> **데크 요건**: W1/F1/F2가 도달 가능하려면 덱이 **공포 국면과 탐욕 국면을 둘 다
> 만들 수 있어야 한다.** §9 샘플(공포 위주)에 탐욕/유포리아 카드를 추가 →
> `data/cards.json`(§13) 참조.

---

## 13. 카드 덱 (`data/cards.json`) — 17장

§1 스키마(순수 JSON 배열). 검증 완료: id 중복 0, R1~R5 각 4~7장 자연등장(고갈 없음),
unlock-only 6장 전부 도달 가능, 깨진 locks/unlocks 참조 0.

**라인 구성 (국면별)**
| 라인 | 카드 | 만드는 국면 | 누구 엔딩을 여는가 |
|---|---|---|---|
| 공포/크래시 | hack_rumor→more_leak→capitulation, rate_hike→recession_fear, whale_fud | fearGreed ↓ (≤30) | 패닉 E1, 고래 W1 셋업 |
| 진정/회복 | authority_denial→dip_buy→vrebound, etf_inflow | 공포 후 반등 | 패닉 E3, 고래 W1 페이오프 |
| 탐욕/유포리아 | celebrity_shill→meme_mania, ath, fomo_news | fearGreed ↑ (≥70) | FOMO F2 셋업, 고래 W2 셋업 |
| 유포리아 반전 | meme_mania→meme_crash, ath→profit_taking | 탐욕 후 급락 | FOMO F1, 고래 W2 |
| 중립 | consolidation | 횡보 | (완충/R5 옵션) |

**unlock-only 카드**(자연 등장 X, 분기로만 열림): `more_leak, capitulation,
recession_fear, meme_mania, meme_crash, profit_taking`. → "광풍을 골랐기에 붕괴가
열린다"는 인과를 강제.

**검증 재현**:
```bash
python3 -c "import json;cards=json.load(open('data/cards.json'));\
print(len(cards),'cards', len({c['id'] for c in cards})==len(cards))"
```

> 미구현(명세만): 카드↔price_engine `base_shock` 연결(BE 1줄), 덱 상태머신(FE),
> 엔딩 게이트 함수(`branch.py`). 임계값은 플레이테스트 보정 대상.
