import { useEffect, useRef, useState } from "react";
import type { CodebookItem, CodebookValidationIssue } from "@annotinder/contracts";
import { AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatJson } from "../../../codebook/jsonFormat";
import { itemShapeError } from "../../../codebook/itemShape";
import { IssueList } from "../IssueList";
import { ITEM_MODEL, JsonCodeEditor } from "../jsonEditor/JsonCodeEditor";

/** The item as JSON: without the editor's `_key`, and without children (they are items of their own). */
export function itemToJson(item: CodebookItem): string {
  const own: Record<string, unknown> = { ...item };
  delete own._key;
  delete own.children;
  return formatJson(own);
}

/**
 * The item for edited JSON, keeping the editor's key and (for loops and
 * conditions) the children; or why it can't be applied. Only the shape the
 * editor needs is checked here; validation shows the rest.
 */
export function itemFromJson(text: string, current: CodebookItem): { item: CodebookItem } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid JSON" };
  }
  const error = itemShapeError(parsed, { children: false });
  if (error) return { error };
  const next: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  const type = next.type;
  const children = (current as { children?: unknown }).children;
  if (type === "unit_loop" || type === "condition") next.children = Array.isArray(children) ? children : [];
  const key = (current as { _key?: string })._key;
  if (key) next._key = key;
  return { item: next as unknown as CodebookItem };
}

/**
 * The selected item edited as JSON (docs/client.md §7). Applied to the draft
 * on every edit that parses to an item; until then the text stays local.
 */
export function ItemJsonEditor({
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
  const [text, setText] = useState(() => itemToJson(item));
  const [error, setError] = useState<string | null>(null);
  /** The item as last applied from here, so the draft echoing it back doesn't reset the text. */
  const applied = useRef(itemToJson(item));

  // Changes from elsewhere (undo, a rename in the tree) replace the text.
  useEffect(() => {
    const json = itemToJson(item);
    if (json === applied.current) return;
    applied.current = json;
    setText(json);
    setError(null);
  }, [item]);

  function edit(next: string) {
    setText(next);
    const result = itemFromJson(next, item);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    applied.current = itemToJson(result.item);
    onChange(result.item);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={readOnly || error !== null}
          onClick={() => setText(itemToJson(item))}
          title="Tidy up the layout: small objects on one line"
        >
          <Sparkles className="h-3 w-3" />
          Format
        </Button>
      </div>
      <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-border">
        <JsonCodeEditor model={ITEM_MODEL} value={text} onChange={edit} readOnly={readOnly} />
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
