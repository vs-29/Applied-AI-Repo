import type { Config } from "tailwindcss";

/**
 * Design tokens for the "reading room" aesthetic.
 * Cool paper background, scholarly slate-blue primary, mono for citation data.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F6F8", // cool paper background
        surface: "#FFFFFF",
        ink: "#1B1F24", // near-black slate
        muted: "#6B7280",
        faint: "#9AA1AC",
        hairline: "#E6E8EC",
        primary: {
          DEFAULT: "#2F4B7C", // scholarly slate-blue
          hover: "#24406b",
          soft: "#EAEEF6",
        },
        status: {
          indexing: "#E2A400", // amber
          ready: "#1F9D6B", // emerald
          error: "#D84C4C",
          idle: "#C4C9D2",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(27,31,36,0.04), 0 4px 16px rgba(27,31,36,0.06)",
        pop: "0 8px 40px rgba(27,31,36,0.16)",
      },
      keyframes: {
        pulsering: {
          "0%": { boxShadow: "0 0 0 0 rgba(226,164,0,0.45)" },
          "70%": { boxShadow: "0 0 0 6px rgba(226,164,0,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(226,164,0,0)" },
        },
        slidein: {
          from: { transform: "translateX(12px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        fadeup: {
          from: { transform: "translateY(6px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        pulsering: "pulsering 1.6s ease-out infinite",
        slidein: "slidein 0.22s ease-out",
        fadeup: "fadeup 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
