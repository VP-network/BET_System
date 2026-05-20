import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        terminal: {
          bg: "#000000",
          green: "#57c97a",
          orange: "#FFA500",
          red: "#FF3333",
          dim: "#0f0f0f",
          border: "#2a2a2a",
          muted: "#666666",
        },
      },
      keyframes: {
        "blink-on-event": {
          "0%": { backgroundColor: "rgba(87,201,122,0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        blink: "blink-on-event 5s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
