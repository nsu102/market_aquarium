"use client";

import React from "react";

/**
 * PixelButton (DESIGN.md §2 PixelButton)
 * - 2px 딥그린 테두리 + 그린 솔리드 드롭섀도우, 둥근 모서리(10px), 클릭 시 눌림.
 * - variant: primary(grass) / secondary(green.100) / danger(amber) / ghost(연녹)
 * - size: sm / md / lg (DESIGN.md 패딩 규격)
 */
type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-pixel-grass text-black",
  secondary: "bg-pixel-table text-black",
  danger: "bg-pixel-danger text-white",
  ghost: "bg-pixel-wall text-black",
};

const SIZE: Record<Size, string> = {
  sm: "px-2 py-1 text-[11px]",
  md: "px-4 py-2 text-[13px]",
  lg: "px-6 py-3 text-[14px]",
};

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function PixelButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-bold border-2 border-black rounded-[10px] select-none cursor-pointer
        shadow-pixel-sm transition-none
        hover:brightness-[0.95]
        active:translate-x-[1px] active:translate-y-[1px] active:shadow-none
        disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0
        ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {children}
    </button>
  );
}
