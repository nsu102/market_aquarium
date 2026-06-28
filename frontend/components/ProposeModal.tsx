"use client";

import { useMemo, useState } from "react";
import { Agent } from "@/mock_data/agents";
import { Player, affectionScore, affectionLabel } from "@/constants/dating";
import { getProfileImg } from "@/lib/profileImg";
import PixelButton from "@/components/pixel/PixelButton";
import { Heart, HeartHandshake } from "lucide-react";

/**
 * 마지막 라운드 직후, 종합(엔딩) 리포트 전에 1회. 한 명에게 프로포즈한다.
 * 콩깍지 지수(감정 합성)는 공개하되, 그 사람의 수익률(=내 점수)은 결혼식 전까진 비밀.
 */
export default function ProposeModal({
  agents,
  player,
  onPropose,
}: {
  agents: Agent[];
  player: Player;
  onPropose: (agentId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const ranked = useMemo(
    () =>
      [...agents]
        .map((a) => ({ a, score: affectionScore(a) }))
        .sort((x, y) => y.score - x.score),
    [agents]
  );

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-pixel-ink/80 p-4">
      <div className="w-[720px] max-w-[94vw] max-h-[90vh] flex flex-col bg-white border-2 border-black rounded-2xl shadow-pixel-lg overflow-hidden animate-pixel-pop">
        {/* Header */}
        <div className="px-5 py-3 bg-pixel-danger border-b-2 border-black flex items-center gap-2">
          <HeartHandshake size={18} className="text-white" />
          <div>
            <div className="text-[15px] font-extrabold text-white leading-tight">운명의 프로포즈</div>
            <div className="text-[10px] text-white/90 font-bold">
              {player.name}님, 평생 함께할 한 명을 고르세요. 무를 수 없습니다.
            </div>
          </div>
        </div>

        {/* Candidates */}
        <div className="flex-1 overflow-y-auto p-4 bg-pixel-wall">
          <div className="grid grid-cols-2 gap-3">
            {ranked.map(({ a, score }) => {
              const profile = getProfileImg(a.id);
              const sel = picked === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setPicked(a.id)}
                  className={`text-left bg-white border-2 rounded-xl p-3 shadow-pixel-sm cursor-pointer transition-transform ${
                    sel ? "border-pixel-danger scale-[1.02]" : "border-black hover:bg-pixel-path"
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-11 h-11 rounded-full border-2 border-black bg-pixel-wall overflow-hidden flex items-center justify-center">
                      {profile ? (
                        <img src={profile} alt={a.alias} className="w-full h-full object-cover" />
                      ) : (
                        <Heart size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-black truncate">{a.alias}</div>
                      <div className="text-[10px] text-pixel-muted font-bold">{affectionLabel(score)}</div>
                    </div>
                    {sel && <Heart size={16} className="text-pixel-danger" fill="currentColor" />}
                  </div>
                  {/* 콩깍지 게이지 */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[8px] bg-pixel-path border-2 border-black rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-pixel-danger"
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-pixel-danger w-9 text-right">{score}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-white border-t-2 border-black flex items-center justify-between">
          <span className="text-[10px] text-pixel-muted font-bold">
            ※ 상대의 통장(수익률)은 결혼식장에서 공개됩니다.
          </span>
          <PixelButton
            variant="primary"
            size="md"
            onClick={() => picked && onPropose(picked)}
            disabled={!picked}
          >
            프로포즈 <HeartHandshake size={14} />
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
