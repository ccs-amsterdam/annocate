import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { describeCondition } from "../../../codebook/conditions";
import { editorTheme, monaco, SCROLLBAR } from "./monacoSetup";
import { useTheme } from "../../../context/theme";

/** What a unit template can refer to, for completions. */
export interface TemplateNames {
  /** The job's unit fields. */
  fields: string[];
  /** The loop's constants. */
  constants: string[];
  /** Questions the template may use (`$var.<q>.value`). */
  questions: string[];
  /** The loop's questions, for `::: from`. */
  loopQuestions: string[];
}

/** What the Insert menu (TemplateInsertMenu) can do with the editor. */
export interface TemplateEditorApi {
  /**
   * Inserts a snippet (Monaco snippet syntax: `$0` is where the cursor
   * ends up, `${TM_SELECTED_TEXT}` the selection it wraps) at the cursor.
   */
  insertSnippet: (snippet: string) => void;
}

export interface MonacoTemplateProps {
  value: string;
  onChange: (value: string) => void;
  names: TemplateNames;
  readOnly?: boolean;
  /** Editor height in pixels. */
  height?: number;
  onReady?: (api: TemplateEditorApi) => void;
  /**
   * "Edit" on the line above a `::: if` fence: edit its condition (e.g. as
   * rules); `apply` puts the new script on the fence.
   */
  onEditCondition?: (script: string, apply: (script: string) => void) => void;
}

// The names of the template being edited (one editor is open at a time).
let current: TemplateNames = { fields: [], constants: [], questions: [], loopQuestions: [] };

const SUFFIXES = [
  ["text", "literal text (default)"],
  ["markdown", "the value as markdown"],
  ["image", "the value is an image URL"],
  ["tokenize", "selectable text, for span questions (only on a bare $unit.x / $const.x)"],
] as const;

// The template language: markdown, with references (`$unit.x`,
// `$const.x`, `$var.q.value`), their `::suffix` and `{{ js }}` expressions
// marked, so they stand out (and nothing looks like an error).
const LANGUAGE = "unit-template";
monaco.languages.register({ id: LANGUAGE });
monaco.languages.setMonarchTokensProvider(LANGUAGE, {
  tokenizer: {
    root: [
      // Block fences (`::: if ...`); the rest of the line is highlighted as usual.
      [/^\s{0,3}:{3,}\s*(else\s+if|if|else|from|style)?/, "keyword.fence"],
      [/\\\$/, ""],
      [/\{\{/, { token: "delimiter.expression", next: "@expression" }],
      [/\$(unit|const|var)(\.\w+)*/, "variable.reference"],
      [/::(text|markdown|image|tokenize)\b/, "keyword.suffix"],
      [/^#{1,6}\s.*$/, "keyword.heading"],
      [/\*\*[^*]+\*\*/, "strong"],
      [/[^\\${:#*]+/, ""],
      [/./, ""],
    ],
    expression: [
      [/\}\}/, { token: "delimiter.expression", next: "@pop" }],
      [/\$(unit|const|var)(\.\w+)*/, "variable.reference"],
      [/'[^']*'|"[^"]*"/, "string"],
      [/./, "expression"],
    ],
  },
});

const FENCES = [
  ["if ", "show this part only if a condition holds"],
  ["else if ", "else, if another condition holds"],
  ["else", "else"],
  ["from ", "show this part from a question of the loop on"],
  ["style ", "this part with CSS, e.g. color: darkred; font-size: 120%"],
] as const;

// Completions: after `$` the kinds of references, after
// `$unit.`, `$const.` or `$var.` the names, after `::` the suffixes.
monaco.languages.registerCompletionItemProvider(LANGUAGE, {
  triggerCharacters: ["$", ".", ":", " "],
  provideCompletionItems(model, position) {
    const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const item = (label: string, detail: string, kind = monaco.languages.CompletionItemKind.Field, insertText = label) => ({
      label,
      detail,
      kind,
      insertText,
      range,
    });
    if (/^\s{0,3}:{3,}\s*from\s+\w*$/.test(before)) {
      return { suggestions: current.loopQuestions.map((n) => item(n, "question of this loop", monaco.languages.CompletionItemKind.Variable)) };
    }
    if (/^\s{0,3}:{3,}\s*\w*$/.test(before)) {
      return {
        suggestions: FENCES.map(([keyword, detail]) => ({
          ...item(keyword.trim(), detail, monaco.languages.CompletionItemKind.Keyword, keyword),
          ...(keyword === "from " ? { command: { id: "editor.action.triggerSuggest", title: "questions" } } : {}),
        })),
      };
    }
    if (before.endsWith(" ")) return { suggestions: [] };
    const ref = /\$(unit|const|var)\.\w*$/.exec(before);
    if (ref) {
      const names =
        ref[1] === "unit"
          ? current.fields.map((n) => item(n, "unit field"))
          : ref[1] === "const"
            ? current.constants.map((n) => item(n, "constant", monaco.languages.CompletionItemKind.Constant))
            : current.questions.map((n) => item(`${n}.value`, "answer", monaco.languages.CompletionItemKind.Variable));
      return { suggestions: names };
    }
    if (/\$[\w.]+::\w*$/.test(before)) {
      return { suggestions: SUFFIXES.map(([s, d]) => item(s, d, monaco.languages.CompletionItemKind.Keyword)) };
    }
    if (/\$\w*$/.test(before)) {
      return {
        suggestions: [
          item("unit.", "a field of the unit", monaco.languages.CompletionItemKind.Module),
          item("const.", "a constant of this loop", monaco.languages.CompletionItemKind.Module),
          item("var.", "an earlier answer", monaco.languages.CompletionItemKind.Module),
        ].map((s) => ({ ...s, command: { id: "editor.action.triggerSuggest", title: "names" } })),
      };
    }
    return { suggestions: [] };
  },
});

// Above each `::: if` / `::: else if` fence: its condition in words, and
// "edit" (the rules editor, MonacoTemplate's onEditCondition).
const IF_FENCE = /^(\s{0,3}:{3,}\s*(?:else\s+if|if)\s+)(.*?)\s*$/;
let editCondition: ((line: number, script: string) => void) | null = null;
const EDIT_CONDITION = "annotinder.editCondition";
monaco.editor.registerCommand(EDIT_CONDITION, (_accessor, line: number, script: string) => editCondition?.(line, script));
monaco.languages.registerCodeLensProvider(LANGUAGE, {
  provideCodeLenses(model) {
    const lenses = [];
    for (let line = 1; line <= model.getLineCount(); line++) {
      const match = IF_FENCE.exec(model.getLineContent(line));
      if (!match || !match[2]) continue;
      lenses.push({
        range: new monaco.Range(line, 1, line, 1),
        command: { id: EDIT_CONDITION, title: `if ${describeCondition({ script: match[2] })}  ·  edit`, arguments: [line, match[2]] },
      });
    }
    return { lenses, dispose: () => undefined };
  },
});

/** A unit template editor: markdown, with completions for references. */
export default function MonacoTemplate({ value, onChange, names, readOnly, height = 240, onReady, onEditCondition }: MonacoTemplateProps) {
  const [theme] = useTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  useEffect(() => {
    current = names;
  }, [names]);
  useEffect(() => {
    editCondition = (line, script) =>
      onEditCondition?.(script, (next) => {
        const editor = editorRef.current;
        const model = editor?.getModel();
        const match = model && IF_FENCE.exec(model.getLineContent(line));
        if (!editor || !model || !match) return;
        const range = new monaco.Range(line, match[1].length + 1, line, model.getLineMaxColumn(line));
        editor.executeEdits("edit-condition", [{ range, text: next }]);
      });
    return () => {
      editCondition = null;
    };
  }, [onEditCondition]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    onReady?.({
      insertSnippet: (snippet) => {
        editor.focus();
        // A block fence starts on its own line.
        const selection = editor.getSelection();
        if (snippet.startsWith(":::") && selection && selection.startColumn > 1) snippet = `\n${snippet}`;
        const controller = editor.getContribution("snippetController2") as { insert: (s: string) => void } | null;
        if (controller) controller.insert(snippet);
        else editor.trigger("insert", "type", { text: snippet });
      },
    });
  };
  return (
    <Editor
      height={height}
      language={LANGUAGE}
      path="template.md"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      theme={editorTheme(theme === "dark")}
      options={{
        readOnly,
        minimap: { enabled: false },
        scrollbar: SCROLLBAR,
        codeLens: true,
        fontSize: 13,
        lineNumbers: "off",
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 8,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        padding: { top: 8, bottom: 8 },
        renderLineHighlight: "none",
        quickSuggestions: false,
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: "off",
      }}
      loading={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading editor...</div>}
    />
  );
}
