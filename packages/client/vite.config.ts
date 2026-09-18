import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone app config: used for local dev (`pnpm dev`) against the mock
// server, and for `vite build` producing a normal deployable SPA (mainly
// useful for demos/local testing, not the primary distribution artifact --
// see vite.lib.config.ts for the importable-library build).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
