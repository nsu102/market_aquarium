"use client";

import { useMemo } from "react";
import { Agent } from "@/mock_data/agents";
import { Asset } from "@/mock_data/market";
import { Player, priceMapFromAssets, totalValue } from "@/constants/dating";
import { getProfileImg } from "@/lib/profileImg";
import { formatKRW } from "@/utils/numberInput";
import PixelButton from "@/components/pixel/PixelButton";
import { Heart, Briefcase, Wallet } from "lucide-react";

/**
 * 게임 시작 직후 1회 노출. 맞선 상대(에이전트)들의 "포트폴리오만" 공개한다.
 * 성격/감정은 일부러 가린다 — 플레이어는 돈만 보고 작업을 시작한다(병맛 컨셉).
 */
export default function SuitorIntro({
  agents,
  assets,
  player,
  onClose,
}: {
  agents: Agent[];
  assets?: Asset[];
  player: Player;
  onClose: () => void;
}) {
  const prices = useMemo(() => priceMapFromAssets(assets), [assets]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-pixel-ink/70 p-4">
      <div className="w-[760px] max-w-[94vw] max-h-[90vh] flex flex-col bg-white border-2 border-black rounded-2xl shadow-pixel-lg overflow-hidden animate-pixel-pop">
        {/* Header */}
        <div className="px-5 py-3 bg-pixel-table border-b-2 border-black flex items-center gap-2">
          <Heart size={16} className="text-pixel-danger" fill="currentColor" />
          <div>
            <div className="text-[15px] font-extrabold text-black leading-tight">맞선 상대 명단</div>
            <div className="text-[10px] text-pixel-muted font-bold">
              {player.name}님, 일단 통장부터 봅시다. 성격은 사귀면서 알아가는 거죠.
            </div>
          </div>
        </div>

        {/* Suitor grid (portfolio only) */}
        <div className="flex-1 overflow-y-auto p-4 bg-pixel-wall">
          <div className="grid grid-cols-2 gap-3">
            {agents.map((a) => {
              const profile = getProfileImg(a.id);
              const holdings = (a.portfolio ?? []).filter((p) => p.amount > 0);
              const net = totalValue(a, prices);
              return (
                <div key={a.id} className="bg-white border-2 border-black rounded-xl p-3 shadow-pixel-sm">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-11 h-11 rounded-full border-2 border-black bg-pixel-wall overflow-hidden flex items-center justify-center">
                      {profile ? (
                        <img src={profile} alt={a.alias} className="w-full h-full object-cover" />
                      ) : (
                        <Heart size={16} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-black truncate">{a.alias}</div>
                      <div className="text-[10px] text-pixel-muted flex items-center gap-1">
                        <Wallet size={10} /> 순자산 {formatKRW(Math.round(net))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 mb-1 text-pixel-muted">
                    <Briefcase size={11} />
                    <span className="text-[10px] font-bold">보유 종목</span>
                  </div>
                  {holdings.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {holdings.slice(0, 8).map((p) => (
                        <span
                          key={p.asset}
                          className="text-[10px] font-bold text-black bg-pixel-path border-2 border-black rounded-md px-1.5 py-[1px]"
                        >
                          {p.asset}
                        </span>
                      ))}
                      {holdings.length > 8 && (
                        <span className="text-[10px] text-pixel-muted">+{holdings.length - 8}</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-pixel-muted">현금만 보유 (안전 추구형? 아니면 쫄보?)</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-white border-t-2 border-black flex items-center justify-between">
          <span className="text-[10px] text-pixel-muted font-bold">
            대화로 감정을 흔들면 이들의 매매가 바뀝니다. 마지막엔 한 명과 결혼!
          </span>
          <PixelButton variant="primary" size="md" onClick={onClose}>
            작업 시작 <Heart size={13} fill="currentColor" />
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
