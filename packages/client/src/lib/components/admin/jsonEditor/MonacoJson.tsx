import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { codebookItemJsonSchema, codebookItemsJsonSchema } from "@annotinder/contracts";
import { CODEBOOK_MODEL, ITEM_MODEL } from "./models";

// Monaco, bundled with the client instead of loaded from a CDN (self-hosted
// servers, privacy), with the JSON language only. This module is loaded
// lazily (JsonCodeEditor), so coders never download it.

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

export type MonacoEditor = Parameters<OnMount>[0];

export interface MonacoJsonProps {
  /** Which schema applies: the whole codebook, or one item. */
  model: typeof CODEBOOK_MODEL | typeof ITEM_MODEL;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onMount?: (editor: MonacoEditor) => void;
}

export default function MonacoJson({ model, value, onChange, readOnly, onMount }: MonacoJsonProps) {
  const isDark =
    typeof window !== "undefined" &&
    (document.documentElement.classList.contains("dark") || window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  return (
    <Editor
      height="100%"
      language="json"
      path={model}
      value={value}
      onMount={onMount}
      onChange={(v) => onChange(v ?? "")}
      theme={isDark ? "vs-dark" : "light"}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
        automaticLayout: true,
        folding: true,
        showFoldingControls: "always",
        padding: { top: 8, bottom: 8 },
        renderLineHighlight: "all",
        quickSuggestions: { strings: true, other: true, comments: false },
      }}
      loading={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}
    />
  );
}
