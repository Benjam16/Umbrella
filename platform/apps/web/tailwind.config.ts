import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        hand: ["var(--font-caveat)", "ui-rounded", "cursive"],
      },
      colors: {
        ink: {
          950: "#07080c",
          900: "#0a0c12",
          850: "#10131b",
          800: "#161a24",
          paper: "#e9e4d7",
        },
        signal: {
          green: "#22d3a6",
          amber: "#fbbf24",
          red: "#fb7185",
          blue: "#38bdf8",
          sepia: "#c8b79a",
        },
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, rgba(7,8,12,0.45), rgba(7,8,12,0.95)), radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56,189,248,0.12), transparent)",
        "paper-grain":
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      boxShadow: {
        ink: "0 1px 0 rgba(255,255,255,0.02) inset, 0 20px 60px -24px rgba(0,0,0,0.8)",
      },
      animation: {
        "ink-float": "inkFloat 9s ease-in-out infinite",
        "ticker-marquee": "tickerMarquee 45s linear infinite",
      },
      keyframes: {
        inkFloat: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) rotate(-1deg)" },
          "50%": { transform: "translate3d(0, -6px, 0) rotate(1deg)" },
        },
        tickerMarquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
