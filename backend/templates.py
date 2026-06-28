"""Static templates: daily plans, reflection, event pool."""

DAILY_PLANS: dict[str, list[str]] = {
    "panic": [
        "게시판에서 시장 분위기를 확인한다",
        "악재가 나오면 빠르게 거래소로 이동한다",
        "공포가 높아지면 손절한다",
    ],
    "fomo": [
        "상승 중인 종목을 찾는다",
        "커뮤니티에서 화제인 종목에 관심을 가진다",
        "기회가 보이면 즉시 매수한다",
    ],
    "value": [
        "뉴스의 신뢰도를 확인한다",
        "루머성 악재에는 반응하지 않는다",
        "과매도 상황이면 매수를 고려한다",
    ],
    "quant": [
        "가격 변동 데이터를 분석한다",
        "이상 신호를 감지하면 포지션을 조정한다",
        "체계적으로 리스크를 관리한다",
    ],
    "whale": [
        "거시 경제 흐름을 확인한다",
        "대중의 공포를 관찰한다",
        "기회가 오면 대량 매수한다",
    ],
    "contrarian": [
        "대중의 분위기를 파악한다",
        "다수가 공포에 빠지면 매수를 준비한다",
        "다수가 탐욕에 빠지면 매도를 준비한다",
    ],
}

REFLECTION_TEMPLATES: dict[str, str] = {
    "panic": "이번에도 공포에 휩쓸려 매도했다. 다음에는 좀 더 기다려볼까...",
    "fomo": "또 고점에 물렸다. 다음에는 좀 더 신중하게...",
    "value": "시장이 흔들려도 펀더멘탈은 변하지 않았다. 판단은 옳았다.",
    "quant": "데이터는 정확했다. 시그널을 신뢰한 것이 맞았다.",
    "whale": "대중의 공포를 활용했다. 유동성이 허락하는 한 계속한다.",
    "contrarian": "역발상이 맞았다. 대중과 반대로 움직인 것이 수익이 됐다.",
}

REFLECTION_THRESHOLD = 30  # ponytail: importanceSum >= 30 triggers reflection

AUTO_EVENTS = [
    {"text": "유명 투자자가 BTC를 추가 매수했다는 루머가 퍼졌다", "impact": "positive"},
    {"text": "갑작스러운 금리 인하 기대감이 확산됐다", "impact": "positive"},
    {"text": "대형 거래소 해킹 의혹이 제기됐다", "impact": "negative"},
    {"text": "주요국 암호화폐 규제 강화 소식이 전해졌다", "impact": "negative"},
    {"text": "실적 발표를 앞두고 루머가 증가했다", "impact": "neutral"},
    {"text": "커뮤니티에서 특정 코인이 밈화되기 시작했다", "impact": "positive"},
    {"text": "고래 지갑에서 대량 이체가 감지됐다", "impact": "neutral"},
    {"text": "스테이블코인 디페깅 우려가 퍼졌다", "impact": "negative"},
]
