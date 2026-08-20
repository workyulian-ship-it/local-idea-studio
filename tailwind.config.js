/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0b",
          panel: "#111113",
          elev: "#17171a",
          hover: "#1e1e22",
          active: "#26262b",
        },
        border: {
          DEFAULT: "#222226",
          strong: "#2d2d33",
        },
        text: {
          DEFAULT: "#e8e8ea",
          muted: "#9a9a9f",
          dim: "#6a6a70",
        },
        accent: {
          DEFAULT: "#7c5cff",
          hover: "#8b6dff",
          muted: "#7c5cff22",
        },
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124, 92, 255, 0.4), 0 0 24px rgba(124, 92, 255, 0.18)",
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};
