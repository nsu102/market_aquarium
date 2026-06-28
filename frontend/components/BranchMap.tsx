"use client";

import { GitBranch, Ghost, Flag } from "lucide-react";
import type { EndingResult } from "@/lib/control";

/** Outcome-coloured accents (win / loss / neutral) per ending id. */
const WIN = "#78F142";
const LOSS = "#C0564A";
const NEUTRAL = "#FFE87C";
const ENDING_ACCENT: Record<string, string> = {
  E1: LOSS, E2: NEUTRAL, E3: WIN, E4: WIN,
  W1: WIN, W2: LOSS, W3: NEUTRAL, W4: NEUTRAL,
  F1: LOSS, F2: WIN, F3: NEUTRAL, F4: NEUTRAL,
};

/**
 * FR-Branch: end-of-game payoff — each protagonist's fate + the nearest
 * un-reached "ghost" branch (the replay hook).
 */
export default function BranchMap({ endings }: { endings: EndingResult[] }) {
  if (!endings || endings.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <GitBranch size={14} className="text-black" />
        <span className="text-[13px] font-bold text-black">주인공 엔딩</span>
        <span className="text-[10px] text-pixel-muted font-bold">
          {endings.length}명
        </span>
      </div>
      <div className="grid gap-2">
        {endings.map((e) => {
          const accent = ENDING_ACCENT[e.ending_id] ?? NEUTRAL;
          return (
            <div
              key={e.agent_id}
              className="border-2 border-black rounded-xl overflow-hidden"
            >
              <div
                className="h-1.5 border-b-2 border-black"
                style={{ background: accent }}
              />
              <div className="p-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 border-2 border-black rounded-md text-black"
                    style={{ background: accent }}
                  >
                    {e.ending_id}
                  </span>
                  <Flag size={13} className="text-black" />
                  <span className="text-[13px] font-bold text-black">
                    {e.title}
                  </span>
                </div>
                <div className="text-[11px] text-pixel-muted mt-1">
                  {e.description}
                </div>
                {e.ghost_text && (
                  <div className="flex items-start gap-1 mt-1.5 text-[10px] text-pixel-muted bg-pixel-path border-2 border-black rounded-lg p-1.5">
                    <Ghost size={12} className="mt-0.5 shrink-0" />
                    <span>{e.ghost_text}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
