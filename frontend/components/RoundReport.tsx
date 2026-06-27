"use client";

import ReactMarkdown from "react-markdown";
import { RoundReport as RoundReportType } from "@/mock_data/rounds";
import { X, FileText } from "lucide-react";

export default function RoundReport({
  report,
  onClose,
}: {
  report: RoundReportType;
  onClose: () => void;
}) {
  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto w-[700px] max-w-[92vw] max-h-[85vh] bg-surface-card border border-border-light rounded-2xl shadow-[0_12px_60px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col animate-slide-up">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-light flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-accent-gold" />
              <span className="text-[13px] font-bold text-text-primary">
                라운드 {report.round} 리포트
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Markdown body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="report-markdown">
              <ReactMarkdown>{report.markdown}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
