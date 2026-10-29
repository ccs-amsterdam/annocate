import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app: `pnpm dev` serves it against the server, and `vite build` makes
// the build the server serves (Dockerfile, docs/hosting.md).
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
    // its paths (coder API, researcher API, admin API, login) to it.
    proxy: {
      "^/(d|job|me|auth|admin|examples)(/|\\?|$)": process.env.SERVER_URL ?? "http://localhost:8787",
    },
  },
});
