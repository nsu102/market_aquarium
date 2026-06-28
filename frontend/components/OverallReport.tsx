"use client";

import { useMemo, type ElementType } from "react";
import {
  Trophy,
  Activity,
  ScrollText,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Brain,
  Medal,
} from "lucide-react";
import PixelModal from "@/components/pixel/PixelModal";
import type { OverallAchievement } from "@/lib/control";
import type { Agent } from "@/mock_data/agents";
import type { LogEntry } from "@/components/ActivityLog";

interface Props {
  report: { markdown: string; achievements: OverallAchievement[] };
  agents?: Agent[];
  activityLog?: LogEntry[];
  onClose: () => void;
}

/** Medal colors for top 3 */
const RANK_STYLE = [
  "bg-yellow-100 border-yellow-400 text-yellow-700",
  "bg-gray-100 border-gray-400 text-gray-500",
  "bg-orange-50 border-orange-300 text-orange-600",
];
const RANK_LABEL = ["1st", "2nd", "3rd"];

/** Parse the markdown report for structured data */
function parseReport(markdown: string) {
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      current = line.replace("## ", "").trim();
      sections[current] = "";
    } else if (current) {
      sections[current] += line + "\n";
    }
  }

  // Parse summary table
  const summaryTable: { label: string; value: string }[] = [];
  const summaryRaw = sections["전체 요약"] || "";
  for (const line of summaryRaw.split("\n")) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
    if (m && !m[1].includes("---")) {
      summaryTable.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }

  // Parse emotion trend
  const emotionTrend: { round: string; pct: number }[] = [];
  const trendRaw = sections["감정 기여도 추이"] || "";
  const trendLine = trendRaw.split("\n").find((l) => l.includes("R"));
  if (trendLine) {
    for (const chunk of trendLine.split("->")) {
      const m = chunk.trim().match(/R(\d+)\s+(\d+(?:\.\d+)?)%/);
      if (m) emotionTrend.push({ round: `R${m[1]}`, pct: parseFloat(m[2]) });
    }
  }
  const trendComment = trendRaw
    .split("\n")
    .find((l) => l && !l.includes("R") && !l.includes("->") && l.trim());

  return { sections, summaryTable, emotionTrend, trendComment };
}

export default function OverallReport({
  report,
  agents,
  activityLog,
  onClose,
}: Props) {
  const rankedAgents = useMemo(() => {
    if (!agents) return [];
    return [...agents]
      .filter((a) => !a.sns_only)
      .map((a) => {
        const holdingsValue = a.portfolio.reduce(
          (s, p) => s + p.amount * p.avgPrice,
          0
        );
        return { ...a, totalValue: a.cash + holdingsValue };
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [agents]);

  const parsed = useMemo(() => parseReport(report.markdown), [report.markdown]);
  const maxEmotion = Math.max(...(parsed.emotionTrend.map((e) => e.pct) || [1]), 1);

  return (
    <PixelModal
      isOpen
      onClose={onClose}
      size="lg"
      title="게임 종합 리포트"
      headerIcon={<Trophy size={15} className="text-black" />}
    >
      <div className="space-y-5">
        {/* ── Achievements ── */}
        {report.achievements.length > 0 && (
          <section>
            <SectionHeader icon={Medal} label="업적" />
            <div className="grid gap-2 sm:grid-cols-2">
              {report.achievements.map((a, i) => (
                <div
                  key={`${a.title}-${i}`}
                  className="flex items-start gap-2.5 bg-pixel-path border-2 border-black rounded-xl p-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 border-2 border-yellow-400 flex items-center justify-center shrink-0">
                    <Trophy size={14} className="text-yellow-700" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-black leading-tight">
                      {a.title}
                    </div>
                    <div className="text-[11px] text-pixel-muted mt-0.5 leading-snug">
                      {a.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Agent Ranking ── */}
        {rankedAgents.length > 0 && (
          <section>
            <SectionHeader icon={Activity} label="에이전트 최종 순위" />
            <div className="grid gap-1.5">
              {rankedAgents.map((a, i) => {
                const isTop3 = i < 3;
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 border-2 rounded-xl px-3 py-2.5 ${
                      isTop3
                        ? RANK_STYLE[i] + " border-2"
                        : "bg-white border-black/15"
                    }`}
                  >
                    {/* Rank badge */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-extrabold border-2 shrink-0 ${
                        isTop3
                          ? RANK_STYLE[i]
                          : "bg-pixel-path border-black/20 text-pixel-muted"
                      }`}
                    >
                      {isTop3 ? RANK_LABEL[i] : i + 1}
                    </div>
                    {/* Name + type */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-black truncate">
                        {a.alias}
                      </div>
                      <div className="text-[10px] text-pixel-muted">{a.type}</div>
                    </div>
                    {/* Portfolio value */}
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-bold tabular-nums text-black">
                        ${a.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-pixel-muted tabular-nums">
                        현금 ${a.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Summary Stats ── */}
        {parsed.summaryTable.length > 0 && (
          <section>
            <SectionHeader icon={BarChart3} label="시장 심리 요약" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {parsed.summaryTable.map((s) => {
                const numVal = parseFloat(s.value);
                const Icon =
                  numVal > 50
                    ? TrendingUp
                    : numVal < 30
                    ? TrendingDown
                    : Minus;
                return (
                  <div
                    key={s.label}
                    className="bg-pixel-path border-2 border-black/15 rounded-xl p-3 text-center"
                  >
                    <Icon
                      size={16}
                      className="mx-auto mb-1 text-pixel-muted"
                    />
                    <div className="text-[15px] font-extrabold text-black tabular-nums">
                      {s.value}
                    </div>
                    <div className="text-[10px] text-pixel-muted mt-0.5 leading-tight">
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Emotion Contribution Trend ── */}
        {parsed.emotionTrend.length > 1 && (
          <section>
            <SectionHeader icon={Brain} label="감정 기여도 추이" />
            <div className="bg-pixel-path border-2 border-black/15 rounded-xl p-4">
              {/* Bar chart */}
              <div className="flex items-end gap-1.5 h-[80px] mb-3">
                {parsed.emotionTrend.map((e) => {
                  const h = Math.max(8, (e.pct / maxEmotion) * 100);
                  return (
                    <div
                      key={e.round}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <span className="text-[9px] font-bold text-pixel-muted tabular-nums">
                        {e.pct.toFixed(0)}%
                      </span>
                      <div
                        className="w-full rounded-t-md bg-pixel-grass border-2 border-black/20"
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Labels */}
              <div className="flex gap-1.5">
                {parsed.emotionTrend.map((e) => (
                  <div
                    key={e.round}
                    className="flex-1 text-center text-[10px] font-bold text-pixel-muted"
                  >
                    {e.round}
                  </div>
                ))}
              </div>
              {/* Comment */}
              {parsed.trendComment && (
                <p className="text-[11px] text-pixel-muted mt-3 leading-snug text-center">
                  {parsed.trendComment.trim()}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Activity Log ── */}
        {activityLog && activityLog.length > 0 && (
          <section>
            <SectionHeader icon={ScrollText} label="활동 로그" count={activityLog.length} />
            <div className="bg-black/90 rounded-xl border-2 border-black p-3 max-h-[180px] overflow-y-auto font-mono">
              {activityLog.slice(-30).map((e) => (
                <div key={e.id} className="flex gap-2 text-[10px] leading-[18px]">
                  <span className="text-green-700 shrink-0 tabular-nums">
                    {e.time}
                  </span>
                  <span className="text-green-400">{e.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PixelModal>
  );
}

/** Reusable section header */
function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: ElementType;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <Icon size={14} className="text-black" />
      <span className="text-[13px] font-bold text-black">{label}</span>
      {count != null && (
        <span className="text-[10px] text-pixel-muted ml-1">({count}건)</span>
      )}
    </div>
  );
}
