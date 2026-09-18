import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// Library-mode build: produces the importable component/hook package
// (see design plan §7 -- "installable without node" == usable as a
// component library inside another host React app, e.g. via
// `import { ... } from "@annotinder/client"`).
export default defineConfig({
  plugins: [
    react(),
    dts({
      entryRoot: "src/lib",
      tsconfigPath: "./tsconfig.app.json",
      include: ["src/lib"],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "AnnotinderClient",
      fileName: "annotinder-client",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
  // This is a component library, not a site -- don't copy public/ (favicons
  // etc, only relevant to the standalone dev app) into the lib output.
  publicDir: false,
});
