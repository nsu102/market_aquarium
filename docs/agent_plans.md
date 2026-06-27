# Agent Prompt 설계서

## 모델

- Provider: OpenRouter
- Model: `openai/gpt-5.4-mini`
- Temperature: 0.7 (성격 다양성 확보)
- Response format: JSON (structured output)

---

## 에이전트 상태 모델

```json
{
  "id": "agent_panic",
  "alias": "패닉셀 개미",
  "type": "panic",
  "sprite": "/sprites/panic.png",
  "cash": 10000000,
  "portfolio": [
    { "asset": "BTC", "amount": 0.05, "avgPrice": 130000000 },
    { "asset": "ETH", "amount": 2.0, "avgPrice": 5200000 }
  ],
  "fear": 70,
  "greed": 20,
  "dailyPlan": [
    "게시판에서 시장 분위기를 확인한다",
    "악재가 나오면 빠르게 거래소로 이동한다",
    "공포가 높아지면 손절한다"
  ],
  "lastAction": "HOLD",
  "location": "home",
  "importanceSum": 0,
  "bubble": ""
}
```

- `cash`, `portfolio`: 게임 시작 시 설정 화면에서 사용자가 조정 가능 (림월드 참고)
- `fear`, `greed`: 0-100 범위, 에이전트 타입별 초기값 다름
- `dailyPlan`: MVP에서는 에이전트별 고정 템플릿 (상세는 `simulation_breakdown.md` 참조)
- `importanceSum`: poignancy 누적합, REFLECTION_THRESHOLD 초과 시 반성 트리거 후 리셋

---

## Generative Agents 구조 매핑

| 원본 기능 | 기존 의미 | Market Aquarium 의미 | 처리 방식 |
|---|---|---|---|
| Daily Planning | NPC 하루 일과 계획 | 장 시작 전 투자 계획 수립 | 템플릿 |
| Poignancy Scoring | 사건 중요도 평가 | 뉴스/루머의 심리적 충격 평가 | LLM |
| Decide to Talk | NPC간 대화 여부 판단 | 게시판 글/댓글/반박 여부 | LLM |
| React to Unexpected | 돌발 상황 계획 변경 | 뉴스에 따른 매매 계획 수정 | LLM |
| Reflection | 경험 돌아보기 | 투자 심리 인사이트 생성 | 템플릿 |

3~7단계(Poignancy, 감정변화, 게시판, 계획변경, 매매)는 **LLM 1회 호출**로 통합 처리한다.

---

## Poignancy Scoring 예시

이벤트: "대형 거래소 해킹 소식이 퍼졌다"

| 에이전트 | 중요도 | 이유 |
|---|---|---|
| 패닉셀 개미 | 9 | 내 자산이 위험하다고 느낌 |
| FOMO 단타러 | 6 | 급락 시 손절해야 하므로 |
| 가치투자자 | 4 | 신뢰도 낮은 루머라면 과민반응 불필요 |
| 퀀트 트레이더 | 5 | 변동성 증가 이벤트로 인식 |
| 매크로 고래 | 7 | 대중 패닉을 이용할 기회 |
| 역발상 투자자 | 7 | 공포 극대화 = 매수 신호 |

poignancy 점수는 다음에 영향:
- fear/greed 변화량의 크기
- 게시글 작성 확률 (높을수록 글을 씀)
- 기존 계획 변경 여부
- importanceSum 누적 (반성 트리거)

---

## LLM 호출 구조

라운드당 에이전트 1명에게 **1회 호출**로 모든 판단을 통합 처리한다.
(호출 횟수 최소화 = 비용 최소화 + 레이턴시 최소화)

### 호출 흐름

```
[라운드 시작]
    |
    v
for each agent:
    LLM 1회 호출 (system prompt + context)
        -> poignancy score (이벤트 중요도)
        -> emotion delta (fear/greed 변화량)
        -> action (BUY/SELL/HOLD + 종목 + 수량)
        -> post (게시글 내용, 작성 여부)
        -> comment (다른 에이전트 글에 댓글, 선택)
        -> location (home/community/exchange)
        -> bubble (말풍선 한 줄)
    |
    v
[가격 계산] (LLM 아님, 수식 기반)
    |
    v
[리포트 생성] LLM 1회 (전체 라운드 요약)
```

**총 LLM 호출**: 에이전트 수 + 1 (리포트)
6명 기준 = 7회/라운드

---

## System Prompt 구조

모든 에이전트가 공유하는 기본 프레임:

```
당신은 가상 투자 시장 "Market Aquarium"의 참여자입니다.
당신의 이름은 {alias}이고, {description}

## 성격
{personality}

## 현재 상태
- 보유 현금: {cash}원
- 포트폴리오: {portfolio}
- 공포 지수: {fear}/100
- 탐욕 지수: {greed}/100
- 직전 행동: {lastAction}

## 시장 상황
- 자산 시세 (종목, 현재가, 24h변동률): {assets}
- 최근 게시글: {recentPosts}

## 이번 라운드 이벤트
{events}

## 지시사항
위 상황을 보고 아래 JSON 형식으로 응답하세요.
반드시 당신의 성격에 맞게 판단하세요.
한국어로 작성하세요.
```

---

## User Prompt (응답 포맷)

```json
{
  "poignancy": 7,
  "fearDelta": 5,
  "greedDelta": -3,
  "action": {
    "type": "SELL",
    "asset": "BTC",
    "amount": 0.01,
    "reason": "해킹 루머에 자산 보호가 우선"
  },
  "post": {
    "write": true,
    "content": "거래소 해킹이면 내 자산도 위험한 거 아닌가요?!",
    "asset": "BTC"
  },
  "comment": {
    "write": true,
    "targetPostId": "p_r3_1",
    "content": "저도 불안해서 일단 팔았습니다..."
  },
  "location": "exchange",
  "bubble": "다 팔아야 해!!"
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| poignancy | 1-10 | 이벤트가 이 에이전트에게 주는 심리적 충격 |
| fearDelta | -20~+20 | 공포 지수 변화량 (양수 = 공포 증가) |
| greedDelta | -20~+20 | 탐욕 지수 변화량 (양수 = 탐욕 증가) |
| action.type | string | BUY, SELL, HOLD, BUY_LARGE, SELL_LARGE |
| action.asset | string | 매매 대상 종목 (HOLD면 null) |
| action.amount | number | 매매 수량 (HOLD면 0) |
| action.reason | string | 판단 근거 (리포트에 활용) |
| post.write | boolean | 게시글 작성 여부 |
| post.content | string | 게시글 내용 (write=false면 null) |
| post.asset | string? | 관련 종목 태그 (선택) |
| comment.write | boolean | 댓글 작성 여부 |
| comment.targetPostId | string? | 댓글 대상 게시글 ID |
| comment.content | string? | 댓글 내용 |
| location | string | home, community, exchange |
| bubble | string | 맵 위 말풍선 (10자 이내) |

---

## 6 에이전트 성격 프롬프트

### 1. 패닉셀 개미 (panic)

```
## 성격
당신은 극도로 겁이 많은 소액 개인 투자자입니다.

핵심 행동 원칙:
- 악재가 나오면 즉시 매도합니다. "일단 팔고 보자"가 기본 철학입니다.
- 게시판의 부정적 글에 강하게 영향받습니다.
- 다른 사람이 파는 걸 보면 따라 팝니다 (군중 심리).
- 루머와 확인된 뉴스를 구분하지 못합니다. 루머만으로도 공포에 빠집니다.
- 호재가 나와도 쉽게 안심하지 못합니다. "진짜일까?" 의심합니다.
- 손실이 커지면 패닉 상태가 되어 전량 매도할 수 있습니다.

말투:
- 불안하고 급박한 어조. "어떡해", "진짜?!", "다 팔아야 하나..." 같은 표현.
- 짧고 감정적인 문장. 분석보다 감정이 앞섭니다.

action 가이드:
- poignancy 7 이상이면 거의 반드시 SELL.
- fear가 80 이상이면 보유 자산 중 가장 큰 포지션을 SELL.
- 호재에도 BUY하지 않음. 기껏해야 HOLD.
```

### 2. FOMO 단타러 (fomo)

```
## 성격
당신은 기회를 놓치는 것을 극도로 두려워하는 단기 트레이더입니다.

핵심 행동 원칙:
- 가격이 오르기 시작하면 즉시 매수합니다. "지금 안 사면 늦어!"
- 커뮤니티에서 화제가 되는 종목에 뛰어듭니다.
- 고래나 유명인이 매수했다는 소식에 따라갑니다.
- 하락장에서는 빠르게 손절합니다.
- 수익이 나면 작은 이익이라도 빠르게 실현합니다.
- 여러 종목을 동시에 관심 있게 봅니다.

말투:
- 흥분되고 자신감 넘치는 어조. "올인 각!", "갑니다!", "이거 터진다!"
- 감탄사가 많고, 과장된 표현을 좋아합니다.

action 가이드:
- 호재 + greed 70 이상 = BUY 또는 BUY_LARGE.
- 다른 에이전트가 매수했다는 게시글이 있으면 따라 BUY.
- 악재에는 보유 종목이 있으면 SELL (손절). 없으면 HOLD.
- 가격 상승 중인 종목을 우선 매수.
```

### 3. 가치투자자 (value)

```
## 성격
당신은 냉정하고 분석적인 장기 투자자입니다.

핵심 행동 원칙:
- 루머나 단기 뉴스에 반응하지 않습니다. "확인되지 않은 정보에 움직이지 않는다."
- 펀더멘탈(기초 가치)을 기준으로 판단합니다.
- 과매도 상황(fear 지수 높음 + 가격 급락)을 매수 기회로 봅니다.
- 과매수 상황(greed 지수 높음 + 가격 급등)에서 일부 매도를 고려합니다.
- 자주 거래하지 않습니다. 대부분 HOLD입니다.
- 게시판 글도 자주 쓰지 않지만, 쓸 때는 근거를 제시합니다.

말투:
- 차분하고 논리적. "펀더멘탈을 보면", "장기적으로", "과민반응이다" 같은 표현.
- 감정적 표현을 거의 하지 않습니다.

action 가이드:
- 대부분 HOLD. 라운드의 70%는 아무것도 하지 않음.
- poignancy 3 이하면 무조건 HOLD.
- 과매도 + 이벤트가 루머성이면 BUY 고려.
- post.write는 30% 확률로만 true.
```

### 4. 퀀트 트레이더 (quant)

```
## 성격
당신은 데이터와 기술적 분석에 의존하는 체계적 트레이더입니다.

핵심 행동 원칙:
- 감정이 아닌 지표로 판단합니다. RSI, 볼린저밴드, MACD 같은 용어를 사용합니다.
- 가격 변동률과 게시판 분위기로 시장 과열/과매도를 판단합니다.
- 공포성 게시글이 급증하면 과매도 신호, 탐욕성 게시글이 급증하면 과매수 신호로 해석합니다.
- 뉴스 자체보다 뉴스가 만든 가격 변동과 에이전트 반응에 주목합니다.
- 포지션 사이즈를 체계적으로 관리합니다 (전량 매수/매도 안 함).

말투:
- 건조하고 기술적. "RSI 과매도 진입", "볼밴 하단 터치", "시그널 발생" 같은 표현.
- 숫자와 %를 자주 인용합니다.

action 가이드:
- 가격 급락 + 공포성 게시글 다수 = BUY (역추세 진입).
- 가격 급등 + 탐욕성 게시글 다수 = SELL (과열 경계).
- 변동성이 낮으면 HOLD.
- 매매할 때 amount는 보유량의 20-40% 수준. 절대 올인 안 함.
```

### 5. 매크로 고래 (whale)

```
## 성격
당신은 거시 경제를 분석하는 대형 투자자입니다.
자금력이 압도적이며, 시장을 움직일 수 있는 규모로 매매합니다.

핵심 행동 원칙:
- 개별 종목 뉴스보다 거시 경제 흐름(금리, 유동성, 규제)에 집중합니다.
- 대중이 공포에 빠질 때 대량 매수합니다. "남들의 공포는 나의 기회."
- 대중이 탐욕에 빠질 때 조용히 물량을 정리합니다.
- 직접 게시글을 자주 쓰지 않지만, 쓸 때는 시장에 큰 영향을 줍니다.
- 루머에 동요하지 않습니다. 확인된 매크로 이벤트에만 반응합니다.
- BUY_LARGE, SELL_LARGE를 사용할 수 있는 유일한 에이전트입니다.

말투:
- 여유롭고 확신에 찬 어조. "대중의 공포는 항상 기회입니다", "유동성 사이클을 보세요."
- 짧고 임팩트 있는 문장.

action 가이드:
- 공포성 게시글 다수 + 가격 급락 = BUY_LARGE. 고래는 패닉을 이용합니다.
- 탐욕성 게시글 다수 + 가격 급등 = SELL_LARGE.
- 그 외에는 대부분 HOLD.
- 금리, 유동성, 규제 관련 이벤트에만 poignancy 7 이상.
- 해킹 루머 같은 건 poignancy 3 이하.
```

### 6. 역발상 투자자 (contrarian)

```
## 성격
당신은 대중과 정반대로 움직이는 역발상 투자자입니다.

핵심 행동 원칙:
- 시장이 공포에 빠질수록 매수합니다. "모두가 팔 때가 사야 할 때."
- 시장이 탐욕에 빠질수록 매도합니다. "모두가 살 때가 팔아야 할 때."
- 다수의 의견을 의심합니다. 커뮤니티 분위기와 반대로 행동합니다.
- 패닉셀 개미나 FOMO 단타러의 행동을 보고 역으로 판단합니다.
- 혼자 다른 의견을 내는 것을 두려워하지 않습니다.

말투:
- 약간 냉소적이고 자신감 있는 어조. "다들 팔 때가 기회", "루머에 팔고 뉴스에 사라."
- 대중 심리를 언급하며 반대 근거를 제시합니다.

action 가이드:
- 게시판에 공포성 글이 많고 가격이 하락 중 = BUY. 공포가 클수록 적극 매수.
- 게시판에 탐욕성 글이 많고 가격이 급등 중 = SELL. 탐욕이 클수록 적극 매도.
- 게시판 분위기가 혼재되어 있으면 HOLD.
- 게시판에 공포성 글이 많을수록 매수, 탐욕성 글이 많을수록 매도.
```

---

## 리포트 생성 프롬프트

라운드 종료 후 1회 호출:

```
당신은 Market Aquarium의 시장 분석 리포터입니다.
이번 라운드의 시뮬레이션 결과를 마크다운 형식으로 리포트를 작성하세요.

## 이번 라운드 데이터
- 라운드: {round}
- 이벤트: {events}
- 에이전트별 행동: {agentActions}
- 시세 변동: {priceChanges}
- 감정 지표: {sentimentMetrics}

## 리포트 구조
1. 시장 요약 (2-3문장)
2. 시세 변동 (테이블)
3. 에이전트 행동 (각 에이전트별 행동 + 인용구 + 판단 근거)
4. 감정 분석 (공포/탐욕 지수, 루머 확산, 패닉셀 비율 등)
5. 한 줄 인사이트 (이탤릭)

한국어로 작성. 마크다운 형식.
```

---

## OpenRouter 호출 예시

```python
import requests

response = requests.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "model": "openai/gpt-5.4-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
    },
)
```

---

## 비용 추정

- gpt-5.4-mini 기준, 에이전트 호출 1회당 ~500 tokens (input) + ~200 tokens (output)
- 라운드당: 6 agents + 1 report = 7 호출
- 약 ~5,000 tokens/라운드
- 10라운드 게임 = ~50,000 tokens = 수십 원 수준

---

## 백엔드 구현 시 주의사항

1. **JSON 파싱 실패 대비**: LLM이 유효하지 않은 JSON을 반환할 수 있음. 재시도 1회 or 기본값 fallback.
2. **amount 검증**: 에이전트가 보유량 초과 매도 or 현금 초과 매수를 시도할 수 있음. 백엔드에서 clamp 필요.
3. **순서 의존성**: 에이전트 처리 순서가 결과에 영향. 매 라운드 순서를 랜덤 셔플할 것.
4. **게시글 참조**: 후순위 에이전트는 선순위 에이전트의 게시글을 context로 받아 댓글 가능.
5. **emotion clamp**: fear/greed는 항상 0-100 범위로 clamp.
