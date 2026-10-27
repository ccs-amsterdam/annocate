import { useEffect, useRef, useState } from "react";
import YAML from "yaml";
import Editor from "@monaco-editor/react";
import type { CodebookItem, CodebookValidationIssue } from "@annotinder/contracts";
import { AlertCircle } from "lucide-react";
import { IssueList } from "../IssueList";

const ITEM_TYPES = ["question", "user_variable", "unit_variable", "unit_loop", "condition", "end"];

/** The item as YAML: without the editor's `_key`, and without children (they are items of their own). */
export function itemToYaml(item: CodebookItem): string {
  const own: Record<string, unknown> = { ...item };
  delete own._key;
  delete own.children;
  return YAML.stringify(own, { indent: 2 });
}

/**
 * The item for edited YAML, keeping the editor's key and (for loops and
 * conditions) the children; or a reason it can't be applied. Only the shape
 * the editor needs is checked here: the rest is validation's job, which
 * shows its messages as for the form.
 */
export function itemFromYaml(text: string, current: CodebookItem): { item: CodebookItem } | { error: string } {
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid YAML" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "The item must be a mapping (name: ..., type: ...)" };
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.name !== "string") return { error: "The item needs a name" };
  if (typeof raw.type !== "string" || !ITEM_TYPES.includes(raw.type)) return { error: `type must be one of ${ITEM_TYPES.join(", ")}` };
  if ("children" in raw) return { error: "Children are edited as items of their own: leave out children" };
  const isQuestion = raw.type === "question" || raw.type === "user_variable" || raw.type === "unit_variable";
  const variable = raw.variable as { type?: unknown } | undefined;
  if (isQuestion && (!variable || typeof variable !== "object" || typeof variable.type !== "string")) {
    return { error: "A question needs a variable with a type" };
  }
  const next: Record<string, unknown> = { ...raw };
  const children = (current as { children?: unknown }).children;
  if (raw.type === "unit_loop" || raw.type === "condition") next.children = Array.isArray(children) ? children : [];
  const key = (current as { _key?: string })._key;
  if (key) next._key = key;
  return { item: next as unknown as CodebookItem };
}

/**
 * The selected item edited as YAML (docs/client.md §7). Applied to the draft
 * on every edit that parses to an item; until then the text stays local.
 */
export function ItemYamlEditor({
  item,
  onChange,
  issues,
  readOnly,
}: {
  item: CodebookItem;
  onChange: (item: CodebookItem) => void;
  issues: CodebookValidationIssue[];
  readOnly: boolean;
}) {
  const [text, setText] = useState(() => itemToYaml(item));
  const [error, setError] = useState<string | null>(null);
  /** The YAML of the item as last applied from here, so the draft echoing it back doesn't reset the text. */
  const applied = useRef(itemToYaml(item));

  // Changes from elsewhere (e.g. a rename in the tree) replace the text.
  useEffect(() => {
    const yaml = itemToYaml(item);
    if (yaml === applied.current) return;
    applied.current = yaml;
    setText(yaml);
    setError(null);
  }, [item]);

  function edit(next: string) {
    setText(next);
    const result = itemFromYaml(next, item);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    applied.current = itemToYaml(result.item);
    onChange(result.item);
  }

  const isDark =
    typeof window !== "undefined" &&
    (document.documentElement.classList.contains("dark") || window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-border">
        <Editor
          height="100%"
          language="yaml"
          value={text}
          onChange={(value) => edit(value ?? "")}
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
            padding: { top: 8, bottom: 8 },
          }}
          loading={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading YAML editor...</div>}
        />
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not applied: {error}
        </p>
      ) : (
        <IssueList issues={issues} />
      )}
    </div>
  );
}
