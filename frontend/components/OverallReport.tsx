"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Trophy } from "lucide-react";
import PixelModal from "@/components/pixel/PixelModal";
import BranchMap from "@/components/BranchMap";
import type { OverallAchievement, EndingResult } from "@/lib/control";

/** FR-9/FR-10/FR-Branch: end-of-game overall report + endings + achievements. */
export default function OverallReport({
  report,
  onClose,
}: {
  report: {
    markdown: string;
    achievements: OverallAchievement[];
    endings?: EndingResult[];
  };
  onClose: () => void;
}) {
  return (
    <PixelModal
      isOpen
      onClose={onClose}
      size="lg"
      title="게임 종합 리포트"
      headerIcon={<Trophy size={15} className="text-black" />}
    >
      <BranchMap endings={report.endings ?? []} />
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
      <div className="report-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
      </div>
    </PixelModal>
  );
}
