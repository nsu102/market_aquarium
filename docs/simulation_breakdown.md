# 시뮬레이션 루프 처리 방식 분류

라운드 1회의 11단계를 LLM / Rule-base / 템플릿 / 난수로 분류한다.

---

## 라운드 흐름 전체 요약

```
1. Daily Plan          [템플릿]     에이전트별 고정 행동 계획
2. 이벤트 발생          [사용자 입력 | 난수]
3. Poignancy Scoring   [LLM]       이벤트 중요도 판정
4. 감정 변화            [Rule-base] LLM delta를 clamp 적용
5. 게시판 행동          [LLM]       게시글/댓글 생성
6. React to Unexpected [LLM]       계획 변경 여부 + 새 행동 결정
7. 매매 행동            [LLM]       BUY/SELL/HOLD 판단
8. 장소 이동            [Rule-base] action 결과에 따라 자동 결정
9. 가격 변화            [Rule-base] 수식 계산
10. 라운드 리포트        [LLM]       마크다운 보고서
11. 반성                [템플릿]     조건 기반 메시지 생성
```

---

## 단계별 상세

### 1. Daily Plan -- 템플릿

기획서: "MVP에서는 LLM으로 매일 계획을 생성하기보다, 에이전트별 템플릿 계획을 사용한다."

에이전트별 고정 계획을 라운드 시작 시 부여한다. LLM 호출 없음.

```json
{
  "panic": [
    "게시판에서 시장 분위기를 확인한다",
    "악재가 나오면 빠르게 거래소로 이동한다",
    "공포가 높아지면 손절한다"
  ],
  "fomo": [
    "상승 중인 종목을 찾는다",
    "커뮤니티에서 화제인 종목에 관심을 가진다",
    "기회가 보이면 즉시 매수한다"
  ],
  "value": [
    "뉴스의 신뢰도를 확인한다",
    "루머성 악재에는 반응하지 않는다",
    "과매도 상황이면 매수를 고려한다"
  ],
  "quant": [
    "가격 변동 데이터를 분석한다",
    "이상 신호를 감지하면 포지션을 조정한다",
    "체계적으로 리스크를 관리한다"
  ],
  "whale": [
    "거시 경제 흐름을 확인한다",
    "대중의 공포를 관찰한다",
    "기회가 오면 대량 매수한다"
  ],
  "contrarian": [
    "대중의 분위기를 파악한다",
    "다수가 공포에 빠지면 매수를 준비한다",
    "다수가 탐욕에 빠지면 매도를 준비한다"
  ]
}
```

이 계획은 LLM 호출 시 context로 함께 전달된다. LLM은 이 계획을 참고해서 행동을 결정한다.

---

### 2. 이벤트 발생 -- 사용자 입력 | 난수

| 경우 | 방식 |
|---|---|
| 사용자가 직접 입력 | 그대로 사용. impact는 LLM이 판정 |
| 사용자 입력 없음 | 이벤트 풀에서 랜덤 선택 |

**자동 이벤트 풀** (백엔드에 미리 정의):

```json
[
  {"text": "유명 투자자가 BTC를 추가 매수했다는 루머가 퍼졌다", "impact": "positive"},
  {"text": "갑작스러운 금리 인하 기대감이 확산됐다", "impact": "positive"},
  {"text": "대형 거래소 해킹 의혹이 제기됐다", "impact": "negative"},
  {"text": "주요국 암호화폐 규제 강화 소식이 전해졌다", "impact": "negative"},
  {"text": "실적 발표를 앞두고 루머가 증가했다", "impact": "neutral"},
  {"text": "커뮤니티에서 특정 코인이 밈화되기 시작했다", "impact": "positive"},
  {"text": "고래 지갑에서 대량 이체가 감지됐다", "impact": "neutral"},
  {"text": "스테이블코인 디페깅 우려가 퍼졌다", "impact": "negative"}
]
```

**impact 판정**: 자동 이벤트는 미리 태깅. 사용자 이벤트는 LLM 1회 호출 또는 키워드 룰베이스로 판정.

---

### 3-7. 에이전트 판단 -- LLM 1회 통합 호출

3~7단계(poignancy, 감정, 게시판, 계획변경, 매매)를 **LLM 1회 호출**로 통합 처리한다.

LLM에 넘기는 context:
```
- 에이전트 성격 (system prompt)
- Daily Plan (이번 라운드 계획)
- 현재 상태 (cash, portfolio, fear, greed, lastAction)
- 자산 시세 + 변동률
- 이번 라운드 이벤트
- 최근 게시글 (앞서 처리된 에이전트의 글 포함)
```

LLM이 반환하는 것:
```json
{
  "poignancy": 8,           // 3단계: 이벤트 중요도
  "fearDelta": 9,            // 4단계: 감정 변화
  "greedDelta": -5,
  "post": { ... },           // 5단계: 게시판 행동
  "comment": { ... },
  "planChanged": true,       // 6단계: 계획 변경 여부
  "action": { ... },         // 7단계: 매매 행동
  "bubble": "다 팔아야 해!!"
}
```

---

### 4. 감정 변화 적용 -- Rule-base

LLM이 제안한 delta를 백엔드가 적용:

```python
agent.fear = clamp(agent.fear + response.fearDelta, 0, 100)
agent.greed = clamp(agent.greed + response.greedDelta, 0, 100)
```

---

### 7. 매매 행동 검증 -- Rule-base

LLM이 판단한 매매를 백엔드가 검증:

```python
if action.type == "SELL":
    holding = get_holding(agent, action.asset)
    action.amount = min(action.amount, holding)  # 보유량 초과 방지

if action.type in ("BUY", "BUY_LARGE"):
    max_buyable = agent.cash / asset_price
    action.amount = min(action.amount, max_buyable)  # 현금 초과 방지

# 포트폴리오 및 현금 업데이트
execute_trade(agent, action)
```

---

### 8. 장소 이동 -- Rule-base

LLM 호출 불필요. action 결과에서 자동 결정:

```python
if action.type in ("BUY", "SELL", "BUY_LARGE", "SELL_LARGE"):
    agent.location = "exchange"
elif response.post.write or response.comment.write:
    agent.location = "community"
else:
    agent.location = "home"
```

---

### 9. 가격 변화 -- Rule-base (수식)

기획서 7번 그대로:

```python
# 이벤트 충격: impact에 따른 기본 변동
event_shock = {
    "negative": uniform(-3.0, -1.0),
    "positive": uniform(1.0, 3.0),
    "neutral": uniform(-0.5, 0.5)
}[event.impact]

# 순매수/매도 압력: 에이전트 매매 집계
net_buy_volume = sum(trade.amount * asset_price for trade if BUY)
net_sell_volume = sum(trade.amount * asset_price for trade if SELL)
trade_pressure = (net_buy_volume - net_sell_volume) / asset_market_cap * scale_factor

# 감정 과열 압력: 전체 에이전트의 fear/greed 편향
avg_fear = mean(agent.fear for agent in agents)
avg_greed = mean(agent.greed for agent in agents)
sentiment_pressure = (avg_greed - avg_fear) / 100 * sentiment_weight

# 노이즈
noise = gauss(0, noise_std)

# 최종 가격 변동률
price_change_pct = event_shock + trade_pressure + sentiment_pressure + noise
new_price = old_price * (1 + price_change_pct / 100)
```

---

### 10. 라운드 리포트 -- LLM 1회

전체 라운드 결과를 모아서 LLM 1회 호출. 마크다운 리포트 생성.

입력: 이벤트, 에이전트별 action/post/감정변화, 시세변동, 지표
출력: 마크다운 문자열

---

### 11. 반성 (Reflection) -- 템플릿

기획서: "Reflection은 조건 기반 템플릿으로 구현"

```python
# 반성 트리거: poignancy 누적합이 임계치 초과
if agent.importance_sum >= REFLECTION_THRESHOLD:
    reflection = REFLECTION_TEMPLATES[agent.type]
    agent.importance_sum = 0  # 리셋
```

템플릿 예시:
```json
{
  "panic": "이번에도 공포에 휩쓸려 매도했다. 다음에는 좀 더 기다려볼까...",
  "fomo": "또 고점에 물렸다. 다음에는 좀 더 신중하게...",
  "value": "시장이 흔들려도 펀더멘탈은 변하지 않았다. 판단은 옳았다.",
  "quant": "데이터는 정확했다. 시그널을 신뢰한 것이 맞았다.",
  "whale": "대중의 공포를 활용했다. 유동성이 허락하는 한 계속한다.",
  "contrarian": "역발상이 맞았다. 대중과 반대로 움직인 것이 수익이 됐다."
}
```

MVP에서 반성은 리포트에 포함되는 텍스트 수준. 행동에 영향을 주지 않는다.

---

## 시장 지표 계산 -- 전부 Rule-base

라운드 종료 후 에이전트 행동 결과를 집계:

```python
# fearGreedIndex: 전체 에이전트 fear/greed 가중평균
fearGreedIndex = round(mean(a.greed for a in agents))

# panicSellRatio: SELL한 에이전트 비율
panicSellRatio = count(SELL actions) / total_agents * 100

# fomoBuyRatio: BUY한 에이전트 비율
fomoBuyRatio = count(BUY actions) / total_agents * 100

# whaleBuyIntensity: 고래 매수 금액 / 전체 매수 금액
whale_buys = sum(amount for whale BUY trades)
total_buys = sum(amount for all BUY trades)
whaleBuyIntensity = whale_buys / total_buys * 100 if total_buys > 0 else 0

# rumorSpeed: 이벤트가 루머성이면 높게, 게시글 수에 비례
rumorSpeed = base_from_event + post_count_factor

# sentimentContribution: 에이전트별 fearDelta 합산
sentimentContribution = [
    {"agent": a.alias, "value": a.greedDelta - a.fearDelta}
    for a in agents
]
```

---

## 전체 LLM 호출 횟수

| 단계 | 호출 수 | 모델 |
|---|---|---|
| 사용자 이벤트 impact 판정 | 0~1회 (룰베이스 가능) | nano |
| 에이전트별 통합 판단 | 에이전트 수 (6) | mini |
| 라운드 리포트 | 1회 | mini |
| **합계** | **7~8회/라운드** | |

---

## 한 줄 요약

```
LLM = 판단 + 언어 (뭘 할지, 뭐라고 말할지)
Rule-base = 적용 + 검증 (가격, 감정, 매매 제한, 지표, 위치)
템플릿 = 고정 패턴 (Daily Plan, 반성)
난수 = 예측 불가능성 (자동 이벤트, 처리 순서, 가격 노이즈)
```
