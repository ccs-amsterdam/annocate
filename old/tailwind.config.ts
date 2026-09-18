import type { Config } from "tailwindcss";

const config = {
  darkMode: ["selector", '[data-dark="on"]'],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      cursor: {
        pencil: "url(/images/pencil-cursor.svg) 16 16, pointer",
      },
      typography: {
        DEFAULT: {
          css: {
            p: { hyphens: "auto" },
          },
        },
        invert: {},
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",

        background: {
          DEFAULT: "hsl(var(--background), <alpha-value>)",
        },
        header: {
          DEFAULT: "hsl(var(--header), <alpha-value>)",
        },
        foreground: {
          DEFAULT: "hsl(var(--foreground), <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary), <alpha-value>)",
          foreground: "hsl(var(--primary-foreground), <alpha-value>)",
          dark: "hsl(var(--primary-dark), <alpha-value>)",
          light: "hsl(var(--primary-light), <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary), <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground), <alpha-value>)",
          dark: "hsl(var(--secondary-dark), <alpha-value>)",
        },
        check: {
          DEFAULT: "hsl(var(--check), <alpha-value>)",
          foreground: "hsl(var(--check-foreground), <alpha-value>)",
        },
        warn: {
          DEFAULT: "hsl(var(--warn), <alpha-value>)",
          foreground: "hsl(var(--warn-foreground), <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive), <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground), <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted), <alpha-value>)",
          foreground: "hsl(var(--muted), <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent), <alpha-value>)",
          foreground: "hsl(var(--accent-foreground), <alpha-value>)",
        },

        card: {
          DEFAULT: "hsl(var(--card), <alpha-value>)",
          foreground: "hsl(var(--card-foreground), <alpha-value>)",
        },
        ring: {
          DEFAULT: "hsl(var(--ring), <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover), <alpha-value>)",
          foreground: "hsl(var(--popover-foreground), <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-200px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(200px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-top": {
          from: { transform: "translateY(-200px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(200px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "spin-slow": "spin 3s linear infinite",
        "slide-in-left": "slide-in-left 0.15s ease-out",
        "slide-in-right": "slide-in-right 0.15s ease-out",
        "slide-in-bottom": "slide-in-bottom 0.15s ease-out",
        "slide-in-top": "slide-in-top 0.15s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;

export default config;
