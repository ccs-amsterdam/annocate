import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone app config: used for local dev (`pnpm dev`) against the
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
    // The server is same-origin with the client (session cookies): forward
    // its paths (coder API, researcher API, login) to it.
    proxy: {
      "^/(d|job|me|auth)(/|\\?|$)": process.env.SERVER_URL ?? "http://localhost:8787",
    },
  },
});
