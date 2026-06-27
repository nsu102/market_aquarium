export interface AgentProfile {
  id: string;
  alias: string;
  type: string;
  sprite: string;
  profile: string;
  color: string;
  defaultCash: number;
  defaultFear: number;
  defaultGreed: number;
  traits: string[];
  description: string;
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "panic",
    alias: "패닉셀 개미",
    type: "panic_seller",
    sprite: "/assets/characters/Jane_Moreno.png",
    profile: "/assets/characters/profile/Jane_Moreno.png",
    color: "#C85A4A",
    defaultCash: 5000000,
    defaultFear: 85,
    defaultGreed: 15,
    traits: ["겁쟁이", "충동적", "군중 추종"],
    description: "악재에 극도로 민감하게 반응하며, 공포가 확산되면 가장 먼저 매도합니다.",
  },
  {
    id: "fomo",
    alias: "FOMO 단타러",
    type: "fomo_trader",
    sprite: "/assets/characters/Eddy_Lin.png",
    profile: "/assets/characters/profile/Eddy_Lin.png",
    color: "#D4A843",
    defaultCash: 5000000,
    defaultFear: 20,
    defaultGreed: 90,
    traits: ["탐욕적", "단기 지향", "트렌드 추종"],
    description: "상승 신호에 즉시 뛰어들며, 남들이 사면 따라 삽니다.",
  },
  {
    id: "value",
    alias: "가치투자자",
    type: "value_investor",
    sprite: "/assets/characters/Klaus_Mueller.png",
    profile: "/assets/characters/profile/Klaus_Mueller.png",
    color: "#5B8FB9",
    defaultCash: 50000000,
    defaultFear: 30,
    defaultGreed: 40,
    traits: ["냉정함", "장기 지향", "펀더멘탈 중시"],
    description: "단기 루머에 흔들리지 않고, 본질적 가치를 기준으로 판단합니다.",
  },
  {
    id: "quant",
    alias: "퀀트 트레이더",
    type: "quant",
    sprite: "/assets/characters/Rajiv_Patel.png",
    profile: "/assets/characters/profile/Rajiv_Patel.png",
    color: "#8B6DB0",
    defaultCash: 20000000,
    defaultFear: 45,
    defaultGreed: 55,
    traits: ["데이터 기반", "기술적 분석", "체계적"],
    description: "차트와 지표를 기반으로 매매하며, 감정보다 수치를 신뢰합니다.",
  },
  {
    id: "whale",
    alias: "매크로 고래",
    type: "whale",
    sprite: "/assets/characters/Arthur_Burton.png",
    profile: "/assets/characters/profile/Arthur_Burton.png",
    color: "#5B8C3E",
    defaultCash: 500000000,
    defaultFear: 10,
    defaultGreed: 70,
    traits: ["대량 매매", "거시 경제", "시장 조성"],
    description: "거시 경제를 분석하고, 대중의 공포를 이용해 대량 매수합니다.",
  },
  {
    id: "contrarian",
    alias: "역발상 투자자",
    type: "contrarian",
    sprite: "/assets/characters/Wolfgang_Schulz.png",
    profile: "/assets/characters/profile/Wolfgang_Schulz.png",
    color: "#5BA88C",
    defaultCash: 15000000,
    defaultFear: 25,
    defaultGreed: 60,
    traits: ["반대 매매", "독립적", "역추세"],
    description: "대중이 공포에 빠질 때 매수하고, 탐욕에 빠질 때 매도합니다.",
  },
];

export const DEFAULT_ASSETS = [
  { symbol: "BTC", name: "비트코인", price: 92450000 },
  { symbol: "ETH", name: "이더리움", price: 4520000 },
  { symbol: "SOL", name: "솔라나", price: 268000 },
  { symbol: "XRP", name: "리플", price: 3250 },
];
