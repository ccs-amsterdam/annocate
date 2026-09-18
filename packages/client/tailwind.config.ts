import type { Config } from "tailwindcss";

// Minimal placeholder config. Phase 4/5 will port the fuller theme (colors,
// ShadCN CSS variables, typography plugin, etc.) from old/tailwind.config.ts
// once the ShadCN components are ported.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
