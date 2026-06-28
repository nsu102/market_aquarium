import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Aquarium - 투자 심리 시뮬레이션",
  description: "AI 에이전트들의 투자 심리 시뮬레이션 게임",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen overflow-hidden">{children}</body>
    </html>
  );
}
