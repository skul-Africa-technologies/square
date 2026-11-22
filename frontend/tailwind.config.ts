import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0D0B",
        "bg-2": "#101410",
        surface: "#202720",
        "surface-hi": "#283128",
        border: "#303A2D",
        text: "#F5F7F2",
        muted: "#929A90",
        lime: "#B6FF3B",
        "lime-hover": "#A3EB2F",
        "lime-tint": "rgba(182,255,59,0.12)",
        blue: "#7DD3FC",
        "blue-strong": "#38BDF8",
        "blue-deep": "#0EA5E9",
        "blue-soft": "rgba(125,211,252,0.12)",
        "blue-border": "rgba(125,211,252,0.35)",
        "name-other": "var(--name-other)",
        "name-self": "var(--name-self)",
      },
      fontFamily: {
        heading: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      borderColor: {
        DEFAULT: "#303A2D",
      },
    },
  },
  plugins: [],
};
export default config;
