import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#050608",
          900: "#0a0c10",
          850: "#0f1218",
          800: "#141820",
        },
        signal: {
          green: "#22d3a6",
          amber: "#fbbf24",
          red: "#fb7185",
          blue: "#38bdf8",
        },
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to bottom, rgba(5,6,8,0.2), rgba(5,6,8,0.92)), radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56,189,248,0.15), transparent)",
      },
    },
  },
  plugins: [],
} satisfies Config;
