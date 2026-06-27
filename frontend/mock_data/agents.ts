export interface Agent {
  id: string;
  alias: string;
  type: string;
  cash: number;
  portfolio: { asset: string; amount: number; avgPrice: number }[];
  fear: number;
  greed: number;
  lastAction: string;
  location: "home" | "community" | "exchange";
  position: { x: number; y: number };
  bubble: string;
  color: string;
}

export const agents: Agent[] = [
  {
    id: "panic",
    alias: "패닉셀 개미",
    type: "panic_seller",
    cash: 1200000,
    portfolio: [{ asset: "BTC", amount: 0.02, avgPrice: 95000000 }],
    fear: 92,
    greed: 15,
    lastAction: "BTC 0.01 매도",
    location: "exchange",
    position: { x: 75, y: 35 },
    bubble: "다 팔아야 해!!",
    color: "#ff4444",
  },
  {
    id: "fomo",
    alias: "FOMO 단타러",
    type: "fomo_trader",
    cash: 3500000,
    portfolio: [
      { asset: "ETH", amount: 1.5, avgPrice: 4800000 },
      { asset: "SOL", amount: 20, avgPrice: 250000 },
    ],
    fear: 20,
    greed: 95,
    lastAction: "SOL 10 매수",
    location: "community",
    position: { x: 42, y: 55 },
    bubble: "지금 안 사면 늦어!",
    color: "#ffaa00",
  },
  {
    id: "value",
    alias: "가치투자자",
    type: "value_investor",
    cash: 50000000,
    portfolio: [{ asset: "BTC", amount: 0.5, avgPrice: 70000000 }],
    fear: 30,
    greed: 40,
    lastAction: "관망",
    location: "home",
    position: { x: 18, y: 25 },
    bubble: "아직 싸지 않아",
    color: "#00d4ff",
  },
  {
    id: "quant",
    alias: "퀀트 트레이더",
    type: "quant",
    cash: 20000000,
    portfolio: [
      { asset: "BTC", amount: 0.1, avgPrice: 88000000 },
      { asset: "ETH", amount: 3, avgPrice: 4500000 },
    ],
    fear: 45,
    greed: 55,
    lastAction: "BTC 롱 포지션",
    location: "exchange",
    position: { x: 70, y: 60 },
    bubble: "RSI 과매도 진입",
    color: "#aa88ff",
  },
  {
    id: "whale",
    alias: "매크로 고래",
    type: "whale",
    cash: 500000000,
    portfolio: [{ asset: "BTC", amount: 5, avgPrice: 60000000 }],
    fear: 10,
    greed: 70,
    lastAction: "BTC 1.0 매수",
    location: "exchange",
    position: { x: 80, y: 50 },
    bubble: "조용히 담자",
    color: "#0088ff",
  },
  {
    id: "news",
    alias: "뉴스 요약 봇",
    type: "news_bot",
    cash: 0,
    portfolio: [],
    fear: 50,
    greed: 50,
    lastAction: "뉴스 분석 중",
    location: "community",
    position: { x: 45, y: 40 },
    bubble: "속보: 금리 동결",
    color: "#ff8800",
  },
  {
    id: "contrarian",
    alias: "역발상 투자자",
    type: "contrarian",
    cash: 15000000,
    portfolio: [{ asset: "ETH", amount: 5, avgPrice: 3800000 }],
    fear: 25,
    greed: 60,
    lastAction: "ETH 2.0 매수",
    location: "home",
    position: { x: 20, y: 60 },
    bubble: "다들 팔 때가 기회",
    color: "#00ff88",
  },
];
