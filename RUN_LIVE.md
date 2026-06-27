# Market Aquarium — 실행 가이드

두 가지 실행 모드가 있다.

## 모드 A — 스탠드얼론 (시장 API, 빠름 / reverie 불필요)

GameSession 라운드 루프만 사용. 맵은 로컬 wander, 시장 로직은 백엔드 :8100.

```bash
# 1) 백엔드
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app:app --port 8100        # http://127.0.0.1:8100

# 2) 프론트
cd ../frontend
npm install
npm run dev                                    # http://localhost:3000
```

셋업 화면에서 **스탠드얼론** 선택 → 시작 → 이벤트 입력.
(백엔드가 꺼져 있으면 자동으로 mock 데이터로 폴백.)

## 모드 B — 라이브(정석) : reverie 인지루프가 이동+행동 구동

에이전트가 the_ville 맵을 실제로 걸어 게시판(Hobbs Cafe)·거래소(Willows)에 도착하고,
도착 시 view_sns/매매가 일어난다. 시장 패널은 movement meta에서 구동된다.

서버 3개 + 키 필요.

```bash
# 0) 키: 루트에 .env (gitignore됨) — OpenRouter 키 (채팅+임베딩 모두 이 키로 동작)
#    OPENROUTER_API_KEY=sk-or-...
#    OPENROUTER_MODEL=openai/gpt-4o-mini       # 또는 anthropic/claude-* 등

# 의존성: reverie는 openai 0.x API 사용 -> 반드시 0.28
python -m pip install "openai==0.28"

# 1) 데이터 API (movement/persona JSON + 에셋)  -- repo 루트에서
python -m uvicorn api_server.main:app --port 8000

# 2) 컨트롤 서버 (reverie 엔진 구동)  -- 반드시 reverie/backend_server 에서
cd reverie/backend_server
python -m uvicorn control_server:app --port 8001

# 3) 프론트
cd ../../frontend
npm run dev
```

셋업 화면에서 **라이브(정석)** 토글 → 시작.
- 내부적으로 `base_the_ville_market6`(6 페르소나)를 포크해 새 sim 생성 후 스텝 실행.
- 시뮬레이터(Phaser)가 스텝을 구동하며 에이전트 이동을 렌더.
- 이벤트 입력 → reverie MarketContext에 주입(FR-1) → 게시판/거래소 도착 시 반응.
- 좌측 시장 패널 / 우측 게시판은 movement meta(market/posts)로 갱신.

### 키 없이 엔진만 헤드리스로 확인 (시각화 없이)

```bash
cd reverie/backend_server
python ../../backend/tools/verify_canonical.py
# 키 있으면 FULL LIVE(실제 LLM), 없으면 OFFLINE(스텁) 로 자동 전환.
# 페르소나가 게시판 도착->view_sns, 거래소 도착->매매, 라운드 리포트까지 출력.
```

## 페르소나 풀 재생성 (필요 시)

```bash
cd backend
python tools/gen_persona_sim.py     # base_the_ville_market6 재생성
```

## 테스트

```bash
cd backend
python -m pytest -q                  # 시장 모듈 + 엔진 + 브리지
```

## 참고
- 보안: 과거 reverie 포크에 평문 노출됐던 OpenRouter 키는 폐기/재발급 권장. 키는 `.env`에만.
- 모드 B의 라운드 종료(가격/리포트)는 하루 경계(자정)에 자동 발생. 시간비율 24h=120초(sec_per_step=72).
