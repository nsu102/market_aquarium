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
