import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone app config: used for local dev (`pnpm dev`) against the mock
// server, and for `vite build` producing a normal deployable SPA (mainly
// useful for demos/local testing, not the primary distribution artifact --
// see vite.lib.config.ts for the importable-library build).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5173,
    // The job server's client API is same-origin (session cookies): forward it to the job server.
    proxy: {
      "/d/": process.env.JOB_SERVER_URL ?? "http://localhost:8788",
    },
  },
});
