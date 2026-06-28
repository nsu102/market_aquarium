import {
  TrendingDown,
  TrendingUp,
  Gem,
  BarChart3,
  Waves,
  Repeat,
  Megaphone,
  User,
  Flame,
  Skull,
  Baby,
  GraduationCap,
  PartyPopper,
  CloudRain,
  Activity,
  Bird,
  type LucideIcon,
} from "lucide-react";

// 에이전트 id / alias / 시스템 키 → lucide 아이콘 매핑.
// 사용처에 따라 id("panic")로도, alias("패닉셀 개미")로도 조회되므로 둘 다 등록한다.
// 누락 시 AGENT_ICONS.default 로 폴백한다.
export const AGENT_ICONS: Record<string, LucideIcon> = {
  // 패닉셀 개미
  panic: TrendingDown,
  "패닉셀 개미": TrendingDown,
  // FOMO 단타러
  fomo: TrendingUp,
  "FOMO 단타러": TrendingUp,
  // 가치투자자
  value: Gem,
  가치투자자: Gem,
  // 퀀트 트레이더
  quant: BarChart3,
  "퀀트 트레이더": BarChart3,
  // 매크로 고래
  whale: Waves,
  "매크로 고래": Waves,
  // 역발상 투자자
  contrarian: Repeat,
  "역발상 투자자": Repeat,
  // 뉴스 요약 봇 (선정 외에도 등장 가능)
  news_bot: Megaphone,
  news: Megaphone,
  "뉴스 요약 봇": Megaphone,
  // 시스템(속보) 게시물
  system: Megaphone,
  시스템: Megaphone,
  // 사용자 본인
  user: User,
  나: User,
  // SNS 전용 관중 (D2)
  sns_ant: Flame,
  불장기원개미: Flame,
  sns_troll: Skull,
  주식방악플러: Skull,
  sns_newbie: Baby,
  코린이뉴비: Baby,
  sns_guru: GraduationCap,
  익명고수: GraduationCap,
  sns_cheer: PartyPopper,
  치어리더: PartyPopper,
  sns_doomer: CloudRain,
  공포팔이: CloudRain,
  sns_quantfan: Activity,
  지표충: Activity,
  sns_contra: Bird,
  청개구리: Bird,
  // 폴백
  default: User,
};
