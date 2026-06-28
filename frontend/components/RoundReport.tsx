"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";
import PixelModal from "@/components/pixel/PixelModal";
import PriceBreakdown, { PriceBreakdownData } from "@/components/PriceBreakdown";

interface ReportView {
  round: number;
  markdown: string;
  price_breakdowns?: PriceBreakdownData[];
}

export default function RoundReport({
  report,
  onClose,
}: {
  report: ReportView;
  onClose: () => void;
}) {
  return (
    <PixelModal
      isOpen
      onClose={onClose}
      size="md"
      title={`라운드 ${report.round} 요약`}
      headerIcon={<FileText size={15} className="text-black" />}
    >
      {report.price_breakdowns && report.price_breakdowns.length > 0 && (
        <div className="mb-4">
          <PriceBreakdown breakdowns={report.price_breakdowns} />
        </div>
      )}
      <div className="report-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
      </div>
    </PixelModal>
  );
}
