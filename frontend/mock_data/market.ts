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

