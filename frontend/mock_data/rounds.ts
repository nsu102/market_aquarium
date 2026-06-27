export interface RoundReport {
  round: number;
  summary: string;
  priceChanges: { asset: string; before: number; after: number }[];
  agentActions: { agentAlias: string; action: string }[];
  keyEvent: string;
}

export const rounds: RoundReport[] = [
  {
    round: 1,
    summary:
      "트럼프 관세 발언에 시장 급락. 패닉셀 개미가 BTC 일부 매도. 고래는 저가 매수.",
    priceChanges: [
      { asset: "BTC", before: 95000000, after: 93800000 },
      { asset: "ETH", before: 4700000, after: 4580000 },
    ],
    agentActions: [
      { agentAlias: "패닉셀 개미", action: "BTC 0.01 매도" },
      { agentAlias: "매크로 고래", action: "BTC 0.5 매수" },
      { agentAlias: "뉴스 요약 봇", action: "관세 뉴스 분석 게시" },
    ],
    keyEvent: "트럼프 중국 반도체 관세 200% 예고",
  },
  {
    round: 2,
    summary:
      "연준 금리 동결 소식에 반등 시도. FOMO 단타러 솔라나 매수. 퀀트 롱 진입.",
    priceChanges: [
      { asset: "BTC", before: 93800000, after: 92000000 },
      { asset: "SOL", before: 255000, after: 265000 },
    ],
    agentActions: [
      { agentAlias: "FOMO 단타러", action: "SOL 10 매수" },
      { agentAlias: "퀀트 트레이더", action: "BTC 롱 포지션" },
      { agentAlias: "가치투자자", action: "관망 유지" },
    ],
    keyEvent: "연준 금리 동결 시사",
  },
  {
    round: 3,
    summary:
      "바이낸스 해킹 루머로 공포 확산. 패닉셀 추가 매도. 역발상 투자자 매수 진입.",
    priceChanges: [
      { asset: "BTC", before: 92000000, after: 92450000 },
      { asset: "ETH", before: 4500000, after: 4520000 },
    ],
    agentActions: [
      { agentAlias: "패닉셀 개미", action: "BTC 0.01 추가 매도" },
      { agentAlias: "역발상 투자자", action: "ETH 2.0 매수" },
      { agentAlias: "매크로 고래", action: "BTC 1.0 매수" },
    ],
    keyEvent: "바이낸스 해킹 루머 확산",
  },
];
