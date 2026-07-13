import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B1020",
        panel: "#111A2E",
        panel2: "#0C1424",
        line: "#20304C",
        ink: "#C7D3E6",
        mute: "#6D7E9C",
        cyan: "#5EEAD4",
        azure: "#5CA8F8",
        edge: "#2A3E63",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
