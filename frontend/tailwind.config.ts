import type { Config } from "tailwindcss";

/**
 * DESIGN.md — White base, monochrome cards, green/amber as ACCENT only.
 * Pretendard, rounded. RULE (user): card backgrounds + borders use ONLY black
 * and white — white card surfaces with black borders/text. Color (green/amber)
 * appears only on small accents (buttons, active states, tags, status, banners).
 * The `black` token is true near-black so `border-black`/`text-black` read crisp.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Borders / text / strokes: black. Surfaces: white. (B&W only)
        black: "#161616",
        white: "#FFFFFF",

        // GREEN ramp — ACCENT only (success / active / brand pop)
        green: {
          50: "#E8F8DC", 100: "#B7EE8C", 200: "#78F142", 400: "#4FA82A",
          600: "#327A1C", 800: "#1E4D11", 900: "#143408",
        },
        // YELLOW ramp — warning / danger (amber accent)
        yellow: {
          50: "#FFF6D6", 100: "#FFE87C", 200: "#FFD23F", 400: "#E0A41E",
          600: "#A8741A", 800: "#6E4B12", 900: "#4A310B",
        },
        // Neutral grays — captions, hovers, soft fills (NOT card bg / NOT border)
        slate: {
          50: "#F8FAFC", 100: "#F2F4F7", 200: "#E4E7EC", 300: "#CBD5E1",
          400: "#AEB4BD", 500: "#6B7280", 600: "#4B5563", 700: "#374151",
          800: "#2F343B", 900: "#161616",
        },

        // Semantic palette — white cards, black borders, color = accent only.
        pixel: {
          grass: "#78F142",     // green.200 — accent / success fill / active
          path: "#F2F4F7",      // neutral light hover/highlight (not a card bg)
          paper: "#FFFFFF",     // card surface
          wall: "#FFFFFF",      // card surface (white)
          table: "#FFFFFF",     // header / tab surface (white, divided by border)
          border: "#161616",    // black line
          water: "#E8F8DC",     // light green accent chip / tag
          danger: "#6E4B12",    // yellow.800 — destructive (pair with ✕ icon)
          ink: "#161616",       // black phone bezel / dark device chrome
          inkSoft: "#2A2D31",   // bezel button / island accent
          cloud: "#FFFFFF",
          muted: "#6B7280",     // caption text on white (gray)
          mutedDark: "#AEB4BD", // caption text on dark bezel
          greenText: "#327A1C", // green.600 — success/up text accent
          blue: "#327A1C",      // info -> green.600
          gold: "#A8741A",      // yellow.600 — emphasis text
        },

        // Legacy semantic aliases.
        surface: {
          primary: "#2F343B",   // dark-neutral backdrop (setup dim)
          secondary: "#FFFFFF",
          tertiary: "#E4E7EC",  // light divider/track
          card: "#FFFFFF",
        },
        border: { DEFAULT: "#161616", light: "#E4E7EC", dark: "#161616" },
        text: { primary: "#161616", secondary: "#374151", tertiary: "#6B7280" },
        accent: {
          green: "#327A1C",
          red: "#6E4B12",       // danger -> burnt amber (no red)
          blue: "#327A1C",
          gold: "#A8741A",
          orange: "#A8741A",
        },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "system-ui", "sans-serif"],
        pixel: ["Galmuri11", "Pretendard", "system-ui", "sans-serif"],
        mono: ["Galmuri11", "monospace"],
      },
      // DESIGN 1-4: rounded — card/button 12px, modal 16px, larger for phone.
      borderRadius: {
        none: "0", sm: "8px", DEFAULT: "12px", md: "12px", lg: "16px",
        xl: "20px", "2xl": "24px", "3xl": "28px", full: "9999px",
      },
      // Solid block drop shadows (blur 0), black — crisp B&W retro card.
      boxShadow: {
        soft: "2px 2px 0 0 #161616",
        card: "3px 3px 0 0 #161616",
        elevated: "5px 5px 0 0 #161616",
        phone: "6px 6px 0 0 #161616",
        "pixel-sm": "2px 2px 0 0 #161616",
        "pixel-md": "3px 3px 0 0 #161616",
        "pixel-lg": "5px 5px 0 0 #161616",
      },
    },
  },
  plugins: [],
};
export default config;
