"use client";

import { forwardRef } from "react";
import dynamic from "next/dynamic";
import { Agent } from "@/mock_data/agents";

const PhaserGame = dynamic(() => import("./PhaserGame"), { ssr: false });

export interface AquariumMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  setSpeed: (speed: number) => void;
}

const AquariumMap = forwardRef<AquariumMapHandle, { agents: Agent[]; onSelectAgent: (a: Agent) => void }>(
  ({ agents, onSelectAgent }, ref) => {
    return (
      <div className="h-full w-full">
        <PhaserGame agents={agents} onSelectAgent={onSelectAgent} mapRef={ref} />
      </div>
    );
  }
);

AquariumMap.displayName = "AquariumMap";
export default AquariumMap;
