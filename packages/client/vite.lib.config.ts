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
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/lib/index.ts"),
      name: "AnnotinderClient",
      fileName: "annotinder-client",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        // Pin the extracted CSS's output filename explicitly -- Vite's
        // default for lib-mode CSS has changed between major versions
        // (was `style.css`, became the entry's own name in a later
        // version), and `package.json`'s `exports["./style.css"]` needs a
        // stable target that doesn't silently break on the next Vite
        // upgrade (design plan §6.5/§7.1).
        assetFileNames: "style.[ext]",
      },
    },
  },
  // This is a component library, not a site -- don't copy public/ (favicons
  // etc, only relevant to the standalone dev app) into the lib output.
  publicDir: false,
});
