import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import { loader } from "@monaco-editor/react";
import { codebookItemJsonSchema, codebookItemsJsonSchema } from "@annotinder/contracts";
import { CODEBOOK_MODEL, ITEM_MODEL } from "./models";

// Monaco, bundled with the client instead of loaded from a CDN (self-hosted
// servers, privacy). The editors that use it (JSON, unit templates) are
// loaded lazily, so coders never download it.

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
loader.config({ monaco });

monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  trailingCommas: "error",
  schemaValidation: "warning",
  enableSchemaRequest: false,
  schemas: [
    { uri: "annotinder://schemas/codebook-items.json", fileMatch: [`*${CODEBOOK_MODEL}`], schema: codebookItemsJsonSchema() },
    { uri: "annotinder://schemas/codebook-item.json", fileMatch: [`*${ITEM_MODEL}`], schema: codebookItemJsonSchema() },
  ],
});

export { monaco };

/** A CSS color (e.g. `var(--primary)`'s value) as `#rrggbb`, as Monaco themes need. */
function hexColor(css: string): string {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#3aac9f";
  ctx.fillStyle = css;
  return ctx.fillStyle.startsWith("#") ? ctx.fillStyle : "#3aac9f";
}

/**
 * The editors' theme: Monaco's light or dark one, with the app's scrollbars
 * (thin, in the primary color; index.css).
 */
export function editorTheme(dark: boolean): string {
  const primary = hexColor(getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  const name = dark ? "annotinder-dark" : "annotinder-light";
  monaco.editor.defineTheme(name, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    // Unit templates (MonacoTemplate.tsx): references in the primary colour.
    rules: [
      { token: "variable.reference", foreground: primary.slice(1), fontStyle: "bold" },
      { token: "keyword.suffix", foreground: dark ? "c586c0" : "af00db" },
      { token: "delimiter.expression", foreground: dark ? "d7ba7d" : "b5651d" },
      { token: "expression", foreground: dark ? "d7ba7d" : "b5651d" },
      { token: "keyword.heading", fontStyle: "bold" },
      { token: "strong", fontStyle: "bold" },
    ],
    colors: {
      "scrollbarSlider.background": `${primary}66`,
      "scrollbarSlider.hoverBackground": `${primary}99`,
      "scrollbarSlider.activeBackground": `${primary}cc`,
      "scrollbar.shadow": "#00000000",
    },
  });
  return name;
}

/** Scrollbar options matching the app's thin scrollbars. */
export const SCROLLBAR = { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false } as const;
