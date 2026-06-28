/**
 * 미연시(연애 시뮬) 피벗용 상수/유틸.
 *
 * 백엔드 무수정 원칙: 기존 감정 5축(fear/greed/confidence/excitement/trust)을
 * 연애 톤으로 재해석하고, 매매 루프는 그대로 둔다. 여기서는 (1) 작업 멘트 프리셋,
 * (2) 감정→콩깍지(호감) 지수, (3) 포트폴리오 평가/수익률, (4) 결혼 엔딩 등급만 담는다.
 */

import { Agent } from "@/mock_data/agents";
import { Asset } from "@/mock_data/market";
import { CHARACTER_POOL, DEFAULT_ASSETS } from "@/constants/agentProfiles";

/* ── 플레이어 ── */

export interface Player {
  name: string;
  /** 캐릭터 풀의 파일명(확장자 제외). 아바타 이미지 경로 파생에 사용. */
  avatar: string;
}

export function avatarProfileSrc(avatar: string): string {
  return `/assets/characters/profile/${avatar}.png`;
}

export function randomAvatar(): string {
  return CHARACTER_POOL[Math.floor(Math.random() * CHARACTER_POOL.length)].name;
}

export const DEFAULT_PLAYER: Player = { name: "나", avatar: "Isabella_Rodriguez" };

/* ── 작업 멘트 프리셋 (병맛) ── */

export const PICKUP_LINES: string[] = [
  "혹시 코인 하세요? 제 마음에 떡상 신호 떴는데요.",
  "당신 보니까 제 심장이 변동성 200% 찍었어요.",
  "우리 익절 말고 평생 존버 같이 할래요?",
  "당신은 제 유일한 우량주예요. 절대 안 팝니다.",
  "님 보는 순간 제 공포지수 0 됐어요.",
  "저랑 사귀면 무조건 떡상 보장. 원금 보장은 안 됨.",
  "지금 제 포트폴리오에서 제일 비싼 건 당신이에요.",
  "우리 사이 손절각 같은 거 없잖아요?",
  "당신만 보면 패닉셀 하고 싶어져요... 제 이성을요.",
  "물려도 좋으니까 당신한테 풀매수 하고 싶어요.",
];

/* ── 감정 → 콩깍지(호감) 지수 ── */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * 5축을 합성한 0~100 "콩깍지 지수". 탐욕/자신감/흥분/신뢰가 높고 공포가 낮을수록
 * 당신에게 콩깍지가 씌었다고 본다(병맛 해석). 옵션축은 50(중립) 기본값.
 */
export function affectionScore(agent: Agent): number {
  const greed = agent.greed ?? 50;
  const fear = agent.fear ?? 50;
  const confidence = agent.confidence ?? 50;
  const excitement = agent.excitement ?? 50;
  const trust = agent.trust ?? 50;
  const raw =
    50 +
    0.28 * (greed - 50) +
    0.22 * (confidence - 50) +
    0.18 * (excitement - 50) +
    0.22 * (trust - 50) -
    0.28 * (fear - 50);
  return Math.round(clamp(raw));
}

export function affectionLabel(score: number): string {
  if (score >= 85) return "결혼하자";
  if (score >= 70) return "완전 콩깍지";
  if (score >= 55) return "썸 타는 중";
  if (score >= 40) return "간 보는 중";
  if (score >= 25) return "별 관심 없음";
  return "손절 직전";
}

/* ── 포트폴리오 평가 / 수익률 ── */

export type PriceMap = Record<string, number>;

export function priceMapFromAssets(assets?: Asset[]): PriceMap {
  const map: PriceMap = {};
  for (const a of DEFAULT_ASSETS) map[a.symbol] = a.price;
  for (const a of assets ?? []) map[a.symbol] = a.price;
  return map;
}

/** 현금 + Σ(보유수량 × 현재가). 가격 없으면 평단가로 대체. */
export function totalValue(agent: Agent, prices: PriceMap): number {
  let sum = agent.cash ?? 0;
  for (const p of agent.portfolio ?? []) {
    const price = prices[p.asset] ?? p.avgPrice ?? 0;
    sum += p.amount * price;
  }
  return sum;
}

/** 시작 시점 총자산 스냅샷(에이전트 id → 총평가액). 시작 가격 기준. */
export function snapshotTotals(agents: Agent[], prices: PriceMap): Record<string, number> {
  const snap: Record<string, number> = {};
  for (const a of agents) snap[a.id] = totalValue(a, prices);
  return snap;
}

/** 초기 대비 수익률(%). 초기 스냅샷 없으면 0. */
export function returnPct(agent: Agent, prices: PriceMap, initial?: number): number {
  if (!initial || initial <= 0) return 0;
  return (totalValue(agent, prices) / initial - 1) * 100;
}

/* ── 결혼 엔딩 등급 (병맛) ── */

export interface EndingGrade {
  grade: string;
  title: string;
  desc: string;
  /** tailwind 안전을 위해 hex 직접 사용 */
  color: string;
}

export function endingGrade(pct: number, spouseAlias: string, playerName: string): EndingGrade {
  if (pct >= 50)
    return {
      grade: "S",
      title: "초대박 결혼",
      desc: `${spouseAlias}의 포트폴리오가 +${pct.toFixed(1)}% 떡상! ${playerName}님은 강남 건물주 사모님이 되어 평생 일 안 합니다.`,
      color: "#FFD23F",
    };
  if (pct >= 15)
    return {
      grade: "A",
      title: "성공한 결혼",
      desc: `${spouseAlias}가 +${pct.toFixed(1)}% 수익을 안고 왔습니다. 신혼집은 전세지만 마음만은 부자, ${playerName}님 안목 인정.`,
      color: "#78F142",
    };
  if (pct >= 0)
    return {
      grade: "B",
      title: "무난한 결혼",
      desc: `${spouseAlias}의 수익률 +${pct.toFixed(1)}%. 대박은 아니어도 굶진 않습니다. 사랑은 원래 본전 치기죠.`,
      color: "#4FA82A",
    };
  if (pct >= -30)
    return {
      grade: "C",
      title: "쪽박 결혼",
      desc: `${spouseAlias}가 ${pct.toFixed(1)}% 물려서 왔습니다. ${playerName}님, 사랑으로 빚을 갚는 인생이 시작됩니다.`,
      color: "#E0A41E",
    };
  return {
    grade: "F",
    title: "파산 결혼",
    desc: `${spouseAlias}의 계좌가 ${pct.toFixed(1)}% 증발했습니다. ${playerName}님은 결혼식 대신 채권추심을 받게 됩니다. 그래도 사랑하죠?`,
    color: "#C0564A",
  };
}
