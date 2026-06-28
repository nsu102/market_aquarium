export interface Agent {
  id: string;
  alias: string;
  type: string;
  sprite: string;
  cash: number;
  portfolio: { asset: string; amount: number; avgPrice: number }[];
  fear: number;
  greed: number;
  // Extra emotion axes (D3): 0..100, 50 = neutral midpoint.
  confidence?: number; // 자신감 ↔ 위축
  excitement?: number; // 흥분 ↔ 침착
  trust?: number; // 신뢰 ↔ 의심
  sns_only?: boolean; // board-only spectator (no map presence)
  lastAction: string;
  location: "home" | "community" | "exchange";
  position: { x: number; y: number };
  bubble: string;
  color: string;
}
