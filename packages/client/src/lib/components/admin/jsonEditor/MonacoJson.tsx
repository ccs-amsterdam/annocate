import Editor, { type OnMount } from "@monaco-editor/react";
import { editorTheme, SCROLLBAR } from "./monacoSetup";
import type { DESIGN_MODEL, ITEM_MODEL, SESSION_PART_MODEL } from "./models";
import { useTheme } from "../../../context/theme";

export type MonacoEditor = Parameters<OnMount>[0];

export interface MonacoJsonProps {
  /** Which schema applies: the whole design, or one item (a Study entry part: none). */
  model: typeof DESIGN_MODEL | typeof ITEM_MODEL | typeof SESSION_PART_MODEL;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onMount?: (editor: MonacoEditor) => void;
}

export default function MonacoJson({ model, value, onChange, readOnly, onMount }: MonacoJsonProps) {
  const [theme] = useTheme();
  return (
    <Editor
      height="100%"
      language="json"
      path={model}
      value={value}
      onMount={onMount}
      onChange={(v) => onChange(v ?? "")}
      theme={editorTheme(theme === "dark")}
      options={{
        readOnly,
        minimap: { enabled: false },
        scrollbar: SCROLLBAR,
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
      loading={
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading editor...</div>
      }
    />
  );
}
