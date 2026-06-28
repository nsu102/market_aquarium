"use client";

import { useMemo } from "react";
import { Agent } from "@/mock_data/agents";
import { Asset } from "@/mock_data/market";
import {
  Player,
  avatarProfileSrc,
  priceMapFromAssets,
  returnPct,
  endingGrade,
} from "@/constants/dating";
import { getProfileImg } from "@/lib/profileImg";
import PixelButton from "@/components/pixel/PixelButton";
import { Heart, FileText, RotateCcw } from "lucide-react";

/**
 * 결혼식(엔딩). 배우자(프로포즈한 에이전트)의 초기 대비 수익률로 등급을 매기고,
 * 병맛 엔딩 카피를 보여준다. 상세 종합 리포트는 버튼으로 열 수 있게 위임.
 */
export default function DatingEnding({
  spouse,
  player,
  assets,
  initialTotal,
  onViewReport,
  onRestart,
}: {
  spouse: Agent;
  player: Player;
  assets?: Asset[];
  initialTotal?: number;
  onViewReport?: () => void;
  onRestart: () => void;
}) {
  const prices = useMemo(() => priceMapFromAssets(assets), [assets]);
  const pct = useMemo(() => returnPct(spouse, prices, initialTotal), [spouse, prices, initialTotal]);
  const grade = useMemo(
    () => endingGrade(pct, spouse.alias, player.name),
    [pct, spouse.alias, player.name]
  );

  const spouseImg = getProfileImg(spouse.id);
  const playerImg = avatarProfileSrc(player.avatar);

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-pixel-ink/85 p-4">
      <div className="w-[560px] max-w-[94vw] flex flex-col bg-white border-2 border-black rounded-2xl shadow-pixel-lg overflow-hidden animate-pixel-pop">
        {/* Banner */}
        <div
          className="px-5 py-4 border-b-2 border-black text-center"
          style={{ backgroundColor: grade.color }}
        >
          <div className="text-[11px] font-extrabold text-black/70 tracking-[0.25em]">JUST MARRIED</div>
          <div className="text-[24px] font-extrabold text-black leading-tight">{grade.title}</div>
          <div className="text-[12px] font-bold text-black/80">엔딩 등급 {grade.grade}</div>
        </div>

        {/* Couple */}
        <div className="flex items-center justify-center gap-3 py-5 bg-pixel-wall">
          <Avatar src={playerImg} label={player.name} />
          <Heart size={26} className="text-pixel-danger" fill="currentColor" />
          <Avatar src={spouseImg} label={spouse.alias} />
        </div>

        {/* Score */}
        <div className="px-6 py-4">
          <div className="bg-pixel-path border-2 border-black rounded-xl p-4 text-center mb-3">
            <div className="text-[10px] font-bold text-pixel-muted tracking-wider mb-1">
              배우자 최종 수익률 (= 당신의 점수)
            </div>
            <div
              className="text-[32px] font-extrabold leading-none"
              style={{ color: pct >= 0 ? "#327A1C" : "#C0564A" }}
            >
              {pct >= 0 ? "+" : ""}
              {pct.toFixed(1)}%
            </div>
          </div>
          <p className="text-[13px] text-black leading-[1.6] text-center">{grade.desc}</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t-2 border-black flex items-center justify-end gap-2">
          {onViewReport && (
            <PixelButton variant="ghost" size="md" onClick={onViewReport}>
              <FileText size={13} /> 상세 리포트
            </PixelButton>
          )}
          <PixelButton variant="primary" size="md" onClick={onRestart}>
            <RotateCcw size={13} /> 다시 결혼하기
          </PixelButton>
        </div>
      </div>
    </div>
  );
}

function Avatar({ src, label }: { src?: string | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[120px]">
      <div className="w-16 h-16 rounded-full border-2 border-black bg-white overflow-hidden flex items-center justify-center">
        {src ? (
          <img src={src} alt={label} className="w-full h-full object-cover" />
        ) : (
          <Heart size={22} />
        )}
      </div>
      <div className="text-[12px] font-bold text-black truncate max-w-full text-center">{label}</div>
    </div>
  );
}
