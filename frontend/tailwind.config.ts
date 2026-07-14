import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0B1020",
        panel: "#111A2E",
        panel2: "#0C1424",
        panel3: "#152238",
        line: "#20304C",
        linesoft: "#1A283F",
        ink: "#C7D3E6",
        inkbright: "#E6EEFB",
        mute: "#6D7E9C",
        cyan: "#5EEAD4",
        azure: "#5CA8F8",
        warm: "#E5B567",
        string: "#86D9C0",
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
