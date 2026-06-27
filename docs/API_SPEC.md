# Market Aquarium API 명세서

## Base URL

```
http://localhost:8000/api
```

---

## 1. 게임 세션

### 1.1 게임 생성

게임 세션을 생성하고 에이전트/에셋 초기 설정을 전달한다.

```
POST /api/games
```

**Request Body**

```json
{
  "agents": [
    {
      "id": "panic",
      "alias": "패닉셀 개미",
      "type": "panic_seller",
      "sprite": "/assets/characters/Jane_Moreno.png",
      "cash": 5000000,
      "portfolio": [
        { "asset": "BTC", "amount": 0.02, "avgPrice": 95000000 }
      ],
      "fear": 85,
      "greed": 15,
      "color": "#C85A4A"
    }
  ],
  "assets": [
    {
      "symbol": "BTC",
      "name": "비트코인",
      "price": 92450000
    }
  ]
}
```

**Response `201`**

```json
{
  "gameId": "g_abc123",
  "round": 1,
  "agents": [
    {
      "id": "panic",
      "alias": "패닉셀 개미",
      "type": "panic_seller",
      "sprite": "/assets/characters/Jane_Moreno.png",
      "cash": 5000000,
      "portfolio": [
        { "asset": "BTC", "amount": 0.02, "avgPrice": 95000000 }
      ],
      "fear": 85,
      "greed": 15,
      "lastAction": "대기",
      "location": "home",
      "bubble": "",
      "color": "#C85A4A"
    }
  ],
  "market": {
    "assets": [
      {
        "symbol": "BTC",
        "name": "비트코인",
        "price": 92450000,
        "change24h": 0,
        "volume": 0,
        "priceHistory": [92450000]
      }
    ],
    "fearGreedIndex": 50,
    "rumorSpeed": 0,
    "panicSellRatio": 0,
    "fomoBuyRatio": 0,
    "whaleBuyIntensity": 0,
    "whaleSellIntensity": 0,
    "sentimentContribution": [
      { "agent": "패닉셀 개미", "value": 0 }
    ]
  }
}
```

---

### 1.2 게임 상태 조회

현재 게임의 전체 상태를 반환한다.

```
GET /api/games/:gameId
```

**Response `200`**

```json
{
  "gameId": "g_abc123",
  "round": 3,
  "agents": [ ... ],
  "market": { ... },
  "posts": [ ... ],
  "events": [ ... ]
}
```

---

## 2. 이벤트

### 2.1 사용자 이벤트 제출

사용자가 이벤트를 입력한다. 백엔드는 impact를 LLM으로 판정한다.

```
POST /api/games/:gameId/events
```

**Request Body**

```json
{
  "text": "트럼프가 중국 반도체 관세 200%를 예고했다"
}
```

**Response `201`**

```json
{
  "event": {
    "id": "e_xyz789",
    "round": 2,
    "text": "트럼프가 중국 반도체 관세 200%를 예고했다",
    "source": "user",
    "impact": "negative",
    "timestamp": "14:42"
  }
}
```

---

## 3. 라운드 진행

### 3.1 다음 라운드 실행

시뮬레이션 루프 1회를 실행한다. 백엔드에서 다음을 순차 처리:

1. 이벤트 중요도 평가 (Poignancy Scoring)
2. 에이전트별 감정 변화 (fear/greed 업데이트)
3. 게시판 행동 (글 작성, 댓글, 반박)
4. 계획 변경 (React to Unexpected)
5. 매매 행동 (BUY/SELL/HOLD)
6. 에이전트 위치 이동
7. 가격 변화 계산
8. 라운드 리포트 생성

```
POST /api/games/:gameId/rounds/next
```

**Request Body** (optional: 라운드와 함께 이벤트 제출)

```json
{
  "event": "바이낸스 해킹 루머 확산"
}
```

또는 이벤트 없이 빈 body로 호출 (자동 이벤트 생성 또는 이벤트 없이 진행).

**Response `200`**

```json
{
  "round": 3,
  "events": [
    {
      "id": "e_auto1",
      "round": 3,
      "text": "바이낸스 해킹 루머 확산",
      "source": "system",
      "impact": "negative",
      "timestamp": "14:40"
    }
  ],
  "agents": [
    {
      "id": "panic",
      "alias": "패닉셀 개미",
      "type": "panic_seller",
      "sprite": "/assets/characters/Jane_Moreno.png",
      "cash": 900000,
      "portfolio": [
        { "asset": "BTC", "amount": 0.01, "avgPrice": 95000000 }
      ],
      "fear": 94,
      "greed": 10,
      "lastAction": "BTC 0.01 매도",
      "location": "exchange",
      "bubble": "다 팔아야 해!!",
      "color": "#C85A4A"
    }
  ],
  "market": {
    "assets": [
      {
        "symbol": "BTC",
        "name": "비트코인",
        "price": 89800000,
        "change24h": -2.9,
        "volume": 3200000000,
        "priceHistory": [92450000, 91200000, 89800000]
      }
    ],
    "fearGreedIndex": 28,
    "rumorSpeed": 89,
    "panicSellRatio": 34,
    "fomoBuyRatio": 12,
    "whaleBuyIntensity": 65,
    "whaleSellIntensity": 15,
    "sentimentContribution": [
      { "agent": "패닉셀 개미", "value": -25 },
      { "agent": "매크로 고래", "value": 30 }
    ]
  },
  "newPosts": [
    {
      "id": "p_r3_1",
      "agentId": "panic",
      "agentAlias": "패닉셀 개미",
      "content": "거래소 해킹이면 내 자산도 위험한 거 아닌가요?!",
      "asset": "BTC",
      "likes": 0,
      "comments": [
        {
          "agentId": "whale",
          "agentAlias": "매크로 고래",
          "content": "FUD입니다. 냉정하게 보세요."
        }
      ],
      "timestamp": "14:40",
      "round": 3
    }
  ],
  "report": {
    "round": 3,
    "markdown": "# Round 3 리포트\n\n## 시장 요약\n\n바이낸스 해킹 루머가..."
  }
}
```

---

## 4. 게시판

### 4.1 게시물 목록 조회

```
GET /api/games/:gameId/posts?round=3
```

**Query Params**

| Param  | Type   | Description                    |
|--------|--------|--------------------------------|
| round  | number | (optional) 특정 라운드 필터    |
| asset  | string | (optional) 종목 필터 (BTC 등)  |

**Response `200`**

```json
{
  "posts": [
    {
      "id": "p_r3_1",
      "agentId": "panic",
      "agentAlias": "패닉셀 개미",
      "content": "비트코인 9천만원 깨지면 진짜 끝이다...",
      "asset": "BTC",
      "likes": 23,
      "comments": [
        {
          "agentId": "contrarian",
          "agentAlias": "역발상 투자자",
          "content": "이럴 때가 오히려 매수 타이밍이죠"
        }
      ],
      "timestamp": "14:42",
      "round": 3
    }
  ]
}
```

---

## 5. 리포트

### 5.1 전체 리포트 조회

지금까지 진행된 모든 라운드의 리포트를 반환한다.

```
GET /api/games/:gameId/reports
```

**Response `200`**

```json
{
  "reports": [
    { "round": 1, "markdown": "# Round 1 리포트\n\n..." },
    { "round": 2, "markdown": "# Round 2 리포트\n\n..." },
    { "round": 3, "markdown": "# Round 3 리포트\n\n..." }
  ]
}
```

---

## 공통 사항

### 에러 응답

```json
{
  "error": "GAME_NOT_FOUND",
  "message": "게임 세션을 찾을 수 없습니다."
}
```

| HTTP Status | Error Code         | Description              |
|-------------|--------------------|--------------------------|
| 400         | INVALID_REQUEST    | 잘못된 요청 파라미터     |
| 404         | GAME_NOT_FOUND     | 게임 세션 없음           |
| 404         | ROUND_NOT_FOUND    | 해당 라운드 없음         |
| 500         | SIMULATION_ERROR   | 시뮬레이션 처리 실패     |

### 타입 정리

```typescript
// 에이전트 액션
type Action = "BUY" | "SELL" | "HOLD" | "BUY_LARGE" | "SELL_LARGE" | string;

// 에이전트 위치
type Location = "home" | "community" | "exchange";

// 이벤트 영향
type Impact = "positive" | "negative" | "neutral";

// 이벤트 출처
type Source = "user" | "system";
```

### 프론트엔드 연동 흐름

```
[SetupScreen]
    |
    | POST /api/games  (에이전트/에셋 설정 전달)
    v
[Game Started] ---- gameId 저장
    |
    | 사용자가 이벤트 입력
    | POST /api/games/:gameId/events
    |
    | 라운드 진행 버튼
    | POST /api/games/:gameId/rounds/next
    |   -> agents, market, newPosts, report 전부 갱신
    |
    | 게시판/리포트는 rounds/next 응답에 포함됨
    | 필요시 개별 조회:
    |   GET /api/games/:gameId/posts
    |   GET /api/games/:gameId/reports
    v
[Round N 완료] -> 반복
```
