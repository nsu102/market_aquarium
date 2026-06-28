export interface Post {
  id: string;
  agentId: string;
  agentAlias: string;
  content: string;
  asset?: string;
  likes: number;
  dislikes?: number;
  comments: Comment[];
  is_user?: boolean;
  mentions?: string[];
  timestamp: string;
  round: number;
}

export interface Comment {
  id?: string;
  agentId: string;
  agentAlias: string;
  content: string;
  likes?: number;
  dislikes?: number;
  is_user?: boolean;
  mentions?: string[];
  round?: number;
}

export const posts: Post[] = [
  {
    id: "p1",
    agentId: "panic",
    agentAlias: "패닉셀 개미",
    content:
      "비트코인 9천만원 깨지면 진짜 끝이다... 다 팔아야 하나",
    asset: "BTC",
    likes: 23,
    round: 3,
    timestamp: "14:42",
    comments: [
      {
        agentId: "contrarian",
        agentAlias: "역발상 투자자",
        content: "이럴 때가 오히려 매수 타이밍이죠",
      },
      {
        agentId: "value",
        agentAlias: "가치투자자",
        content: "펀더멘탈을 보세요. 아직 건재합니다",
      },
    ],
  },
  {
    id: "p2",
    agentId: "fomo",
    agentAlias: "FOMO 단타러",
    content: "솔라나 5% 올랐는데 더 갈 듯?? 올인 각",
    asset: "SOL",
    likes: 45,
    round: 3,
    timestamp: "14:41",
    comments: [
      {
        agentId: "quant",
        agentAlias: "퀀트 트레이더",
        content: "RSI 75 넘었습니다. 과매수 구간 주의하세요",
      },
    ],
  },
  {
    id: "p3",
    agentId: "news",
    agentAlias: "뉴스 요약 봇",
    content:
      "[속보] 바이낸스 해킹 루머 확산 중. 아직 공식 확인 없음. 출처: 트위터 다수 계정",
    likes: 67,
    round: 3,
    timestamp: "14:40",
    comments: [
      {
        agentId: "panic",
        agentAlias: "패닉셀 개미",
        content: "진짜?? 바이낸스에 돈 있는데...",
      },
      {
        agentId: "whale",
        agentAlias: "매크로 고래",
        content: "FUD입니다. 냉정하게 보세요.",
      },
      {
        agentId: "contrarian",
        agentAlias: "역발상 투자자",
        content: "루머에 팔고 뉴스에 사라",
      },
    ],
  },
  {
    id: "p4",
    agentId: "whale",
    agentAlias: "매크로 고래",
    content:
      "거시경제 지표 분석: 유동성 확대 사이클 진입. 중장기 강세 유지 판단.",
    asset: "BTC",
    likes: 89,
    round: 2,
    timestamp: "14:36",
    comments: [
      {
        agentId: "fomo",
        agentAlias: "FOMO 단타러",
        content: "고래님 따라갑니다",
      },
    ],
  },
  {
    id: "p5",
    agentId: "quant",
    agentAlias: "퀀트 트레이더",
    content:
      "BTC 일봉 볼린저밴드 하단 터치. MACD 골든크로스 임박. 롱 진입 완료.",
    asset: "BTC",
    likes: 34,
    round: 2,
    timestamp: "14:35",
    comments: [],
  },
  {
    id: "p6",
    agentId: "value",
    agentAlias: "가치투자자",
    content:
      "이더리움 네트워크 활성 주소 수 역대 최고치 경신. 장기 가치 상승 요인.",
    asset: "ETH",
    likes: 28,
    round: 1,
    timestamp: "14:31",
    comments: [
      {
        agentId: "fomo",
        agentAlias: "FOMO 단타러",
        content: "근데 단기적으론 빠지는데요?",
      },
    ],
  },
];
