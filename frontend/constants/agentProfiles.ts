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
    color: "#6E4B12",
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
    color: "#FFD23F",
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
    color: "#327A1C",
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
    color: "#A8741A",
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
    color: "#1E4D11",
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
    color: "#4FA82A",
    defaultCash: 15000000,
    defaultFear: 25,
    defaultGreed: 60,
    traits: ["반대 매매", "독립적", "역추세"],
    description: "대중이 공포에 빠질 때 매수하고, 탐욕에 빠질 때 매도합니다.",
  },
];

/* All 25 available character sprites for custom agents */
export const CHARACTER_POOL = [
  { name: "Jane_Moreno", label: "Jane Moreno" },
  { name: "Eddy_Lin", label: "Eddy Lin" },
  { name: "Klaus_Mueller", label: "Klaus Mueller" },
  { name: "Rajiv_Patel", label: "Rajiv Patel" },
  { name: "Arthur_Burton", label: "Arthur Burton" },
  { name: "Wolfgang_Schulz", label: "Wolfgang Schulz" },
  { name: "Sam_Moore", label: "Sam Moore" },
  { name: "Abigail_Chen", label: "Abigail Chen" },
  { name: "Adam_Smith", label: "Adam Smith" },
  { name: "Ayesha_Khan", label: "Ayesha Khan" },
  { name: "Carlos_Gomez", label: "Carlos Gomez" },
  { name: "Carmen_Ortiz", label: "Carmen Ortiz" },
  { name: "Francisco_Lopez", label: "Francisco Lopez" },
  { name: "Giorgio_Rossi", label: "Giorgio Rossi" },
  { name: "Hailey_Johnson", label: "Hailey Johnson" },
  { name: "Isabella_Rodriguez", label: "Isabella Rodriguez" },
  { name: "Jennifer_Moore", label: "Jennifer Moore" },
  { name: "John_Lin", label: "John Lin" },
  { name: "Latoya_Williams", label: "Latoya Williams" },
  { name: "Maria_Lopez", label: "Maria Lopez" },
  { name: "Mei_Lin", label: "Mei Lin" },
  { name: "Ryan_Park", label: "Ryan Park" },
  { name: "Tamara_Taylor", label: "Tamara Taylor" },
  { name: "Tom_Moreno", label: "Tom Moreno" },
  { name: "Yuriko_Yamamoto", label: "Yuriko Yamamoto" },
];

export const CUSTOM_COLORS = [
  "#6E4B12", "#FFD23F", "#327A1C", "#A8741A", "#1E4D11", "#4FA82A",
  "#E0A41E", "#A8741A", "#327A1C", "#6E4B12", "#4FA82A", "#A8741A",
  "#327A1C", "#6E4B12", "#78F142", "#6E4B12", "#B7EE8C", "#327A1C",
];

export const DEFAULT_ASSETS = [
  { symbol: "BTC", name: "비트코인", price: 92450000 },
  { symbol: "ETH", name: "이더리움", price: 4520000 },
  { symbol: "SOL", name: "솔라나", price: 268000 },
  { symbol: "XRP", name: "리플", price: 3250 },
];
