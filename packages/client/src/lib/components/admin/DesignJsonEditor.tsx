import { useEffect, useRef, useState } from "react";
import { designItems, splitDesignItems, type TopLevelItem } from "@annotinder/contracts";
import { AlertCircle, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatJson } from "../../design/jsonFormat";
import { designShapeError } from "../../design/itemShape";
import { getFoldableLineNumbers } from "../../design/jsonFolding";
import { DESIGN_MODEL, JsonCodeEditor } from "./jsonEditor/JsonCodeEditor";
import type { MonacoEditor } from "./jsonEditor/MonacoJson";

/** Monaco's folding contribution: internals, not in its public types. */
interface FoldingModel {
  regions: {
    length: number;
    getStartLineNumber(i: number): number;
    isCollapsed(i: number): boolean;
    toRegion(i: number): unknown;
  } | null;
  toggleCollapseState(regions: unknown[]): void;
}

/** Collapses the "variable" and "layout" objects only, never the items around them. */
async function foldDetails(editor: MonacoEditor | null) {
  const text = editor?.getModel()?.getValue();
  if (!editor || !text) return;
  const lines = new Set(getFoldableLineNumbers(text));
  const contribution = editor.getContribution("editor.contrib.folding") as {
    getFoldingModel?(): Promise<FoldingModel | null>;
  } | null;
  const model = await contribution?.getFoldingModel?.();
  const regions = model?.regions;
  if (!model || !regions) return;
  const toFold: unknown[] = [];
  for (let i = 0; i < regions.length; i++) {
    if (lines.has(regions.getStartLineNumber(i)) && !regions.isCollapsed(i)) toFold.push(regions.toRegion(i));
  }
  if (toFold.length) model.toggleCollapseState(toFold);
}

/**
 * The editor's items as the design shows them: `{ public, session, items }`.
 * (The editor holds the session and public info as its first item, the
 * Study entry: contracts `designItems`.)
 */
function designText(items: TopLevelItem[]): string {
  const { items: rest, session, public: info } = splitDesignItems(items);
  return formatJson({ public: info, session, items: rest });
}

/**
 * The whole design as JSON (docs/client.md §7), with completion and checks
 * from the design's JSON Schema. Applied to the draft on every edit that
 * parses to items the editor can show; validation issues are listed in the
 * toolbar as for the visual editor.
 */
export function DesignJsonEditor({
  items,
  onChange,
  disabled,
}: {
  items: TopLevelItem[];
  onChange: (items: TopLevelItem[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => designText(items));
  const [error, setError] = useState<string | null>(null);
  const applied = useRef(designText(items));
  const editorRef = useRef<MonacoEditor | null>(null);

  // Changes from elsewhere (undo, revert) replace the text.
  useEffect(() => {
    const json = designText(items);
    if (json === applied.current) return;
    applied.current = json;
    setText(json);
    setError(null);
  }, [items]);

  function edit(next: string) {
    setText(next);
    let parsed: unknown;
    try {
      parsed = JSON.parse(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }
    const shape = designShapeError(parsed);
    if (shape) {
      setError(shape);
      return;
    }
    setError(null);
    const design = parsed as { items: TopLevelItem[]; session?: never; public?: never };
    const nextItems = designItems(design) as TopLevelItem[];
    applied.current = designText(nextItems);
    onChange(nextItems);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-end gap-1.5 px-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void foldDetails(editorRef.current)}
          className="h-7 gap-1 text-xs"
          title="Collapse the variable and layout details"
        >
          <Minimize2 className="h-3 w-3" />
          Fold details
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => editorRef.current?.trigger("unfoldAll", "editor.unfoldAll", {})}
          className="h-7 gap-1 text-xs"
        >
          <Maximize2 className="h-3 w-3" />
          Unfold all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setText(formatJson(JSON.parse(text)))}
          disabled={disabled || error !== null}
          className="h-7 gap-1 text-xs"
          title="Tidy up the layout: small objects on one line"
        >
          <Sparkles className="h-3 w-3" />
          Format
        </Button>
      </div>

      <div className="relative min-h-[400px] flex-1 overflow-hidden rounded-lg border border-border shadow-inner">
        <JsonCodeEditor
          model={DESIGN_MODEL}
          value={text}
          onChange={edit}
          readOnly={disabled}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Not applied: {error}
        </p>
      )}
    </div>
  );
}
