/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["'IBM Plex Sans Arabic'", "'IBM Plex Sans Arabic Fallback'", "'Inter'", "'Inter Fallback'", "sans-serif"],
        arabic: ["'IBM Plex Sans Arabic'", "'IBM Plex Sans Arabic Fallback'", "sans-serif"],
        latin: ["'Inter'", "'Inter Fallback'", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background, 0 0% 100%))",
          foreground: "hsl(var(--sidebar-foreground, 222 47% 11%))",
          primary: "hsl(var(--sidebar-primary, 222 47% 11%))",
          accent: "hsl(var(--sidebar-accent, 210 40% 96%))",
          border: "hsl(var(--sidebar-border, 214.3 31.8% 91.4%))",
        },
        industrial: {
          bg: "#F8FAFC",
          card: "#FFFFFF",
          border: "#E2E8F0",
          primary: "#0F172A",
          accent: "#0284C7",
          emerald: "#10B981",
          amber: "#F59E0B",
          rose: "#F43F5E",
          indigo: "#4F46E5",
          slate: "#334155",
        },
      },
      borderRadius: {
        "3xl": "1.5rem",
        "2xl": "1rem",
        xl: "0.75rem",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "subtle": "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        "card": "0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.03)",
        "card-hover": "0 10px 25px -4px rgb(0 0 0 / 0.07), 0 4px 6px -2px rgb(0 0 0 / 0.04)",
        "glow-sky": "0 0 20px -3px rgba(2, 132, 199, 0.22)",
        "glow-emerald": "0 0 20px -3px rgba(16, 185, 129, 0.22)",
        "inner-subtle": "inset 0 1px 2px 0 rgb(0 0 0 / 0.03)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-subtle": "pulse-subtle 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
