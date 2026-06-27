export interface MarketData {
  assets: Asset[];
  fearGreedIndex: number;
  rumorSpeed: number;
  panicSellRatio: number;
  fomoBuyRatio: number;
  whaleBuyIntensity: number;
  whaleSellIntensity: number;
  sentimentContribution: { agent: string; value: number }[];
}

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume: number;
  priceHistory: number[];
}

export const marketData: MarketData = {
  assets: [
    { symbol: "BTC", name: "비트코인", price: 92450000, change24h: -3.2, volume: 2800000000, priceHistory: [95000000, 94200000, 93800000, 92000000, 91500000, 92450000] },
    { symbol: "ETH", name: "이더리움", price: 4520000, change24h: -1.8, volume: 1200000000, priceHistory: [4700000, 4650000, 4580000, 4500000, 4480000, 4520000] },
    { symbol: "SOL", name: "솔라나", price: 268000, change24h: 5.4, volume: 800000000, priceHistory: [245000, 250000, 255000, 260000, 265000, 268000] },
    { symbol: "XRP", name: "리플", price: 3250, change24h: -0.5, volume: 500000000, priceHistory: [3300, 3280, 3260, 3240, 3230, 3250] },
  ],
  fearGreedIndex: 35,
  rumorSpeed: 72,
  panicSellRatio: 38,
  fomoBuyRatio: 45,
  whaleBuyIntensity: 78,
  whaleSellIntensity: 22,
  sentimentContribution: [
    { agent: "패닉셀 개미", value: -25 },
    { agent: "FOMO 단타러", value: 15 },
    { agent: "가치투자자", value: 5 },
    { agent: "퀀트 트레이더", value: 10 },
    { agent: "매크로 고래", value: 30 },
    { agent: "뉴스 요약 봇", value: -10 },
    { agent: "역발상 투자자", value: 20 },
  ],
};
