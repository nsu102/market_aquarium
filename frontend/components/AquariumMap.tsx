"use client";

import dynamic from "next/dynamic";
import { Agent } from "@/mock_data/agents";

const PhaserGame = dynamic(() => import("./PhaserGame"), { ssr: false });

export default function AquariumMap({ agents, onSelectAgent }: { agents: Agent[]; onSelectAgent: (a: Agent) => void }) {
  return (
    <div className="h-full w-full">
      <PhaserGame agents={agents} onSelectAgent={onSelectAgent} />
    </div>
  );
}
