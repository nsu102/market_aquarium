"use client";

import React from "react";

/**
 * PixelPanel — 카드/패널 공통 표면 (DESIGN.md: 라이트 배경 + 2px 딥그린 + 그린 솔리드 섀도우, 둥근 12px).
 * tone: paper/cloud(흰 카드) / wall(연녹 카드) / ink(딥그린 패널, 흰 글자) / path(밝은 강조)
 */
type Tone = "wall" | "ink" | "cloud" | "path";

const TONE: Record<Tone, string> = {
  wall: "bg-pixel-wall text-black",
  ink: "bg-pixel-ink text-white",
  cloud: "bg-white text-black",
  path: "bg-pixel-path text-black",
};

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  shadow?: boolean;
}

export default function PixelPanel({
  tone = "wall",
  shadow = true,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      className={`border-2 border-black rounded-xl ${shadow ? "shadow-pixel-md" : ""} ${TONE[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
