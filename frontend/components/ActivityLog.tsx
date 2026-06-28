"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

export interface LogEntry {
  id: string;
  time: string;
  text: string;
}

interface Props {
  entries: LogEntry[];
}

export default function ActivityLog({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  // ponytail: show last 50 entries max, older ones scroll away
  const visible = entries.slice(-50);

  return (
    <div className="absolute bottom-5 right-4 z-30 w-[340px] max-h-[200px] bg-black/85 border border-green-800 rounded-lg overflow-hidden font-mono backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-green-900/60 bg-black/60">
        <Terminal size={11} className="text-green-500" />
        <span className="text-[9px] text-green-500 font-bold tracking-widest uppercase">Activity Log</span>
        <span className="ml-auto text-[9px] text-green-700 tabular-nums">{entries.length}</span>
      </div>
      {/* Scrollable log */}
      <div className="overflow-y-auto max-h-[168px] px-2.5 py-1.5 scrollbar-thin">
        {visible.map((e) => (
          <div key={e.id} className="flex gap-2 text-[10px] leading-[18px] animate-fade-in">
            <span className="text-green-700 shrink-0 tabular-nums">{e.time}</span>
            <span className="text-green-400">{e.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
