export interface GameEvent {
  id: string;
  round: number;
  text: string;
  source: "user" | "system";
  impact: "positive" | "negative" | "neutral";
  timestamp: string;
}

export const events: GameEvent[] = [
  { id: "e1", round: 1, text: "트럼프가 중국 반도체 관세 200%를 예고했다", source: "user", impact: "negative", timestamp: "14:30" },
  { id: "e2", round: 1, text: "비트코인 ETF 순유입 $500M 기록", source: "system", impact: "positive", timestamp: "14:31" },
  { id: "e3", round: 2, text: "연준 파월 의장 금리 동결 시사", source: "system", impact: "neutral", timestamp: "14:35" },
  { id: "e4", round: 2, text: "테더 USDT 10억 달러 신규 발행", source: "system", impact: "positive", timestamp: "14:36" },
  { id: "e5", round: 3, text: "바이낸스 해킹 루머 확산", source: "system", impact: "negative", timestamp: "14:40" },
];
