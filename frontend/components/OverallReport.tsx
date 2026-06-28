"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Trophy, Activity, ScrollText } from "lucide-react";
import PixelModal from "@/components/pixel/PixelModal";
import BranchMap from "@/components/BranchMap";
import type { OverallAchievement, EndingResult } from "@/lib/control";
import type { Agent } from "@/mock_data/agents";
import type { LogEntry } from "@/components/ActivityLog";

interface Props {
  report: { markdown: string; achievements: OverallAchievement[]; endings?: EndingResult[] };
  agents?: Agent[];
  activityLog?: LogEntry[];
  onClose: () => void;
}

/** FR-9/FR-10: end-of-game overall report + achievements + agent performance + activity log. */
export default function OverallReport({
  report,
  agents,
  activityLog,
  onClose,
}: Props) {
  // Compute total portfolio value and rank agents
  const rankedAgents = agents
    ? [...agents]
        .filter((a) => !a.sns_only)
        .map((a) => {
          const holdingsValue = a.portfolio.reduce((s, p) => s + p.amount * p.avgPrice, 0);
          return { ...a, totalValue: a.cash + holdingsValue };
        })
        .sort((a, b) => b.totalValue - a.totalValue)
    : [];

  return (
    <PixelModal
      isOpen
      onClose={onClose}
      size="lg"
      title="게임 종합 리포트"
      headerIcon={<Trophy size={15} className="text-black" />}
    >
      {/* Achievements */}
      {report.achievements && report.achievements.length > 0 && (
        <div className="mb-4 grid gap-2">
          {report.achievements.map((a, i) => (
            <div
              key={`${a.title}-${i}`}
              className="flex items-start gap-2 bg-pixel-path border-2 border-black rounded-xl p-2.5"
            >
              <Trophy size={16} className="text-black mt-0.5 shrink-0" />
              <div>
                <div className="text-[13px] font-bold text-black">{a.title}</div>
                <div className="text-[11px] text-pixel-muted">{a.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FR-Branch: protagonist endings */}
      {report.endings && report.endings.length > 0 && (
        <BranchMap endings={report.endings} />
      )}

      {/* Agent Performance Ranking */}
      {rankedAgents.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity size={14} className="text-black" />
            <span className="text-[13px] font-bold text-black">에이전트 최종 성과</span>
          </div>
          <div className="grid gap-1.5">
            {rankedAgents.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-2 bg-white border border-black/20 rounded-lg px-3 py-2"
              >
                <span className="text-[12px] font-bold text-pixel-muted w-5 text-right">
                  {i + 1}.
                </span>
                <span className="text-[12px] font-bold text-black flex-1 truncate">
                  {a.alias}
                </span>
                <span className="text-[10px] text-pixel-muted tabular-nums">
                  ${a.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Markdown Report */}
      <div className="report-markdown mb-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
      </div>

      {/* Activity Log Summary */}
      {activityLog && activityLog.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <ScrollText size={14} className="text-black" />
            <span className="text-[13px] font-bold text-black">활동 로그</span>
            <span className="text-[10px] text-pixel-muted ml-1">({activityLog.length}건)</span>
          </div>
          <div className="bg-black/90 rounded-lg border border-green-800 p-3 max-h-[200px] overflow-y-auto font-mono">
            {activityLog.slice(-30).map((e) => (
              <div key={e.id} className="flex gap-2 text-[10px] leading-[18px]">
                <span className="text-green-700 shrink-0 tabular-nums">{e.time}</span>
                <span className="text-green-400">{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PixelModal>
  );
}
