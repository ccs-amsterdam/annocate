import { useState, useEffect, useRef } from "react";
import YAML from "yaml";
import Editor from "@monaco-editor/react";
import { CodebookItemsSchema, type TopLevelItem } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Sparkles, Minimize2, Maximize2 } from "lucide-react";

interface CodebookYamlEditorProps {
  items: TopLevelItem[];
  onChange: (items: TopLevelItem[]) => void;
  disabled?: boolean;
}

interface ValidationError {
  path: string;
  message: string;
}

/** Matches lines that introduce variable definitions or layout configurations */
export const FOLD_LINE_REGEX = /^\s*(variable|variables|layout|layouts):\s*($|#)/;

/** Matches lines that introduce codebook items (e.g. "- name: ..." or "- type: ...") */
export const CODEBOOK_ITEM_LINE_REGEX =
  /^\s*-\s+(name:\s+|type:\s*(user_variable|unit_variable|unit_loop|condition)\b)/;

/**
 * Adds an empty blank line before every codebook item (at root level or inside children/conditions),
 * creating clear visual whitespace between questions, loops, and variables, while keeping
 * sub-lists like 'codes' compact.
 */
export function addBlankLinesBetweenCodebookItems(yamlString: string): string {
  const lines = yamlString.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CODEBOOK_ITEM_LINE_REGEX.test(line) && i > 0) {
      if (result.length > 0 && result[result.length - 1].trim() !== "") {
        result.push("");
      }
    }
    result.push(line);
  }

  return result.join("\n");
}

export const addBlankLinesBetweenRootItems = addBlankLinesBetweenCodebookItems;

/** Formats items or parsed YAML object with 2-space indentation and blank lines between codebook items */
export function formatCodebookYaml(items: unknown): string {
  const raw = YAML.stringify(items, { indent: 2 });
  return addBlankLinesBetweenCodebookItems(raw);
}

/**
 * Returns 1-based line numbers of sections ("variable", "variables", "layout", "layouts")
 * that have nested child content and should be folded by default.
 */
export function getFoldableLineNumbers(text: string): number[] {
  const lines = text.split("\n");
  const lineNumbers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (FOLD_LINE_REGEX.test(lines[i])) {
      if (i + 1 < lines.length) {
        const currentIndent = lines[i].search(/\S/);
        const nextIndent = lines[i + 1].search(/\S/);
        if (nextIndent > currentIndent) {
          lineNumbers.push(i + 1); // 1-based line number
        }
      }
    }
  }
  return lineNumbers;
}

/**
 * Specifically collapses ONLY the folding regions starting on "variable" or "layout" lines.
 * Never collapses parent regions (such as "- name:" items) or other sections.
 */
export async function foldDefaultSections(editorInstance: any) {
  if (!editorInstance) return;
  const model = editorInstance.getModel?.();
  if (!model) return;

  const text = model.getValue();
  const lineNumbers = getFoldableLineNumbers(text);
  if (lineNumbers.length === 0) return;
  const targetLines = new Set(lineNumbers);

  const foldingController = editorInstance.getContribution?.("editor.contrib.folding");
  if (!foldingController?.getFoldingModel) return;

  const foldingModel = await foldingController.getFoldingModel();
  if (!foldingModel) return;

  function doFold(): boolean {
    const regions = foldingModel.regions;
    if (!regions || regions.length === 0) return false;

    const toToggle: any[] = [];
    for (let i = 0; i < regions.length; i++) {
      const startLine = regions.getStartLineNumber(i);
      const isCollapsed = regions.isCollapsed(i);
      // Strictly target only regions whose start line matches variable/layout
      if (targetLines.has(startLine) && !isCollapsed) {
        toToggle.push(regions.toRegion(i));
      }
    }

    if (toToggle.length > 0) {
      foldingModel.toggleCollapseState(toToggle);
    }
    return true;
  }

  // Attempt fold immediately
  const success = doFold();
  if (!success) {
    // If folding regions are still computing asynchronously, wait for onDidChange
    let handled = false;
    const disposable = foldingModel.onDidChange?.(() => {
      if (!handled && doFold()) {
        handled = true;
        disposable?.dispose?.();
      }
    });
    // Fallback timeout in case event already fired
    setTimeout(() => {
      if (!handled) {
        handled = true;
        doFold();
        disposable?.dispose?.();
      }
    }, 250);
  }
}

/**
 * Monaco-based YAML codebook editor.
 * Allows inspecting and editing codebook items directly as structured YAML,
 * with syntax highlighting, indentation guides, and real-time Zod schema validation.
 * Selectively folds only "variable" and "layout" sections by default.
 */
export function CodebookYamlEditor({ items, onChange, disabled }: CodebookYamlEditorProps) {
  const [yamlText, setYamlText] = useState(() => formatCodebookYaml(items));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValid, setIsValid] = useState(true);
  const isInternalChangeRef = useRef(false);
  const editorRef = useRef<any>(null);

  // Determine dark mode based on document class or OS preference
  const isDark =
    typeof window !== "undefined" &&
    (document.documentElement.classList.contains("dark") ||
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);

  // Sync external items into YAML text only when items change externally
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    const formatted = formatCodebookYaml(items);
    setYamlText(formatted);
  }, [items]);

  function handleTextChange(newText: string) {
    isInternalChangeRef.current = true;
    setYamlText(newText);

    try {
      const parsed = YAML.parse(newText);
      if (!Array.isArray(parsed)) {
        setErrors([{ path: "root", message: "Codebook YAML must be a list (array) of items" }]);
        setIsValid(false);
        return;
      }

      const result = CodebookItemsSchema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "items";
          return {
            path,
            message: issue.message,
          };
        });
        setErrors(issues);
        setIsValid(false);
        return;
      }

      // Valid!
      setErrors([]);
      setIsValid(true);
      onChange(result.data as TopLevelItem[]);
    } catch (err) {
      setErrors([
        {
          path: "YAML Syntax",
          message: err instanceof Error ? err.message : "Invalid YAML syntax",
        },
      ]);
      setIsValid(false);
    }
  }

  function handleFormat() {
    try {
      const parsed = YAML.parse(yamlText);
      const formatted = formatCodebookYaml(parsed);
      isInternalChangeRef.current = true;
      setYamlText(formatted);
      setTimeout(() => foldDefaultSections(editorRef.current), 100);
    } catch {
      // Ignore if invalid syntax
    }
  }

  function handleUnfoldAll() {
    if (!editorRef.current) return;
    editorRef.current.trigger("unfoldAll", "editor.unfoldAll", {});
  }

  function handleFoldDefaults() {
    foldDefaultSections(editorRef.current);
  }

  function handleEditorMount(editor: any) {
    editorRef.current = editor;
    foldDefaultSections(editor);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {isValid ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valid Codebook Schema
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {errors.length} validation {errors.length === 1 ? "error" : "errors"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFoldDefaults}
            className="h-7 gap-1 text-xs cursor-pointer"
            title="Collapse variable and layout details only"
          >
            <Minimize2 className="h-3 w-3" />
            Fold Details
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleUnfoldAll}
            className="h-7 gap-1 text-xs cursor-pointer"
            title="Unfold all sections"
          >
            <Maximize2 className="h-3 w-3" />
            Unfold All
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleFormat}
            disabled={disabled || !isValid}
            className="h-7 gap-1 text-xs cursor-pointer"
          >
            <Sparkles className="h-3 w-3" />
            Format YAML
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-[400px] overflow-hidden rounded-lg border border-border shadow-inner">
        <Editor
          height="100%"
          language="yaml"
          value={yamlText}
          onMount={handleEditorMount}
          onChange={(value) => handleTextChange(value ?? "")}
          theme={isDark ? "vs-dark" : "light"}
          options={{
            readOnly: disabled,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: "on",
            automaticLayout: true,
            folding: true,
            showFoldingControls: "always",
            foldingStrategy: "indentation",
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: "all",
          }}
          loading={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading YAML editor...
            </div>
          }
        />
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          <p className="font-semibold mb-1">Schema Validation Issues:</p>
          <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
            {errors.map((err, i) => (
              <li key={i}>
                <span className="font-mono font-medium">{err.path}:</span> {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
