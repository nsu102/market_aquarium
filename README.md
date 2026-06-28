# Market Village — 감정이 가격을 움직이는 시장 심리 시뮬레이션

AI 에이전트들이 투자 커뮤니티에서 뉴스에 반응하고, 감정에 따라 매매하며, 가격을 움직이는 과정을 관찰하는 시뮬레이션 게임입니다.

## 핵심 루프

```
이벤트 → 감정 변화 → 게시판 토론(전염) → 매매 결정 → 가격 변동 → 라운드 리포트
```

## 구조

| 서버 | 포트 | 역할 |
|---|---|---|
| **Market API** | 8100 | 시장 로직: 에이전트, 감정, 매매, 가격, 리포트 |
| Data API (`api_server`) | 8000 | Phaser 맵 뷰어용 이동/페르소나 JSON |
| Frontend (Next.js) | 3000 | 게임 UI |

## 빠른 시작

### 1. 백엔드

```bash
cd backend
docker compose up -d              # MongoDB (27018)
python -m pip install -r requirements.txt
python -m backend.seed            # 시드 데이터 삽입
python -m uvicorn app:app --reload --port 8100
```

LLM 없이도 scripted offline client로 동작합니다. LLM 연동 시:

```bash
export OPENROUTER_API_KEY=sk-or-...
export OPENROUTER_MODEL=anthropic/claude-3.5-haiku
```

### 2. 데이터 서버

```bash
# 프로젝트 루트에서
python api_server.py
```

### 3. 프론트엔드

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

## 시뮬레이션 모듈 (`backend/sim/`)

| 모듈 | 기능 |
|---|---|
| `engine.py` | 라운드 오케스트레이션 (GameSession) |
| `emotion.py` | 5축 감정 변화 (공포/탐욕/자신감/흥분/신뢰) — LLM 판단 |
| `sns.py` | 게시판 글쓰기/댓글/감정 전염 |
| `trade.py` | LLM 기반 매매 결정 |
| `price_engine.py` | 가격 = 이벤트 + 매매압력 + 감정과열 + 노이즈 |
| `report.py` | 라운드/종합 리포트, 감정 기여도, 업적 |
| `credibility.py` | 뉴스 신뢰도 판별 (루머 필터링) |
| `market_state.py` | 공포/탐욕 지수, 패닉셀/FOMO 비율 |

## 테스트

```bash
cd backend
python -m pytest -q
```

## 크레딧

맵 에셋: [Generative Agents](https://arxiv.org/abs/2304.03442) 프로젝트 기반
- Background: PixyMoon
- Furniture: LimeZu
- Characters: pipohi
