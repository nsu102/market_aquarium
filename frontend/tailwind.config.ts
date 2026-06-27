import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          primary: "#FAF6EE",
          secondary: "#F0EBE0",
          tertiary: "#E6DFD2",
          card: "#FFFFFF",
        },
        border: {
          DEFAULT: "#D4C9B5",
          light: "#E6DFD2",
          dark: "#BFB49E",
        },
        text: {
          primary: "#3D3529",
          secondary: "#7A6E5D",
          tertiary: "#A69A88",
        },
        accent: {
          green: "#5B8C3E",
          red: "#C85A4A",
          blue: "#5B8FB9",
          gold: "#D4A843",
          orange: "#D48A3C",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 3px rgba(61, 53, 41, 0.08)",
        card: "0 2px 8px rgba(61, 53, 41, 0.06)",
        elevated: "0 4px 16px rgba(61, 53, 41, 0.1)",
        phone: "0 8px 32px rgba(61, 53, 41, 0.15), 0 2px 8px rgba(61, 53, 41, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
