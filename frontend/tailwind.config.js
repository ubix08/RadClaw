/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:  ["'Geist'", "system-ui", "sans-serif"],
        mono:  ["'Geist Mono'", "'Fira Code'", "monospace"],
        serif: ["'Instrument Serif'", "Georgia", "serif"],
      },
      colors: {
        bg:      { DEFAULT: "#0a0a0b", 2: "#111114", 3: "#18181d", 4: "#1e1e25" },
        border:  { DEFAULT: "#2a2a35", 2: "#353545" },
        text:    { DEFAULT: "#e8e8f0", 2: "#9898b0", 3: "#606078" },
        accent:  { DEFAULT: "#c97fff", dim: "#6d3fa8", glow: "#8b5cf6" },
        user:    { bg: "#1a1028", border: "#4c2a7a" },
      },
      animation: {
        "fade-up":   "fadeUp 0.18s ease-out both",
        "pulse-dot": "pulseDot 1.4s ease-in-out infinite",
        "blink":     "blink 1s step-end infinite",
      },
      keyframes: {
        fadeUp:   { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        pulseDot: { "0%,80%,100%": { transform: "scale(0.6)", opacity: ".4" }, "40%": { transform: "scale(1)", opacity: "1" } },
        blink:    { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
    },
  },
  plugins: [],
}
