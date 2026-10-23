/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Navy Primary Palette (GovTech Core)
        gov: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#020617",
        },
        // Electric Indigo Accents
        accent: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
          950: "#1E1B4B",
        },
        // Semantic GovTech Status Colors
        success: {
          DEFAULT: "#059669",
          hover: "#047857",
          bg: "#ECFDF5",
          border: "#A7F3D0",
          text: "#065F46",
        },
        warning: {
          DEFAULT: "#D97706",
          hover: "#B45309",
          bg: "#FFFBEB",
          border: "#FDE68A",
          text: "#92400E",
        },
        critical: {
          DEFAULT: "#DC2626",
          hover: "#B91C1C",
          bg: "#FEF2F2",
          border: "#FECACA",
          text: "#991B1B",
        },
        flag: {
          DEFAULT: "#7C3AED",
          hover: "#6D28D9",
          bg: "#F5F3FF",
          border: "#DDD6FE",
          text: "#5B21B6",
        },
        // Backward-compatible Brand Aliases
        brand: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          600: "#4F46E5",
          700: "#4338CA",
          900: "#0F172A",
        },
        err: {
          DEFAULT: "#DC2626",
          bg: "#FEF2F2",
        },
        warn: {
          DEFAULT: "#D97706",
          bg: "#FFFBEB",
        },
        ok: {
          DEFAULT: "#059669",
          bg: "#ECFDF5",
        },
      },
      boxShadow: {
        "premium": "0 4px 20px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)",
        "premium-hover": "0 12px 28px -4px rgba(15, 23, 42, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.06)",
        "premium-lg": "0 20px 32px -6px rgba(15, 23, 42, 0.14), 0 8px 12px -3px rgba(15, 23, 42, 0.08)",
        "premium-inner": "inset 0 2px 4px 0 rgba(15, 23, 42, 0.06)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.75", transform: "scale(1.05)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-up": "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-glow": "pulseGlow 2.5s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};
