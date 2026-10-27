import { flattenTree } from "../../../codebook/tree";
import { CodebookTreeView } from "../CodebookTreeView";
import type { CodebookDraft } from "./useCodebookDraft";

/** Left column of the visual editor: the item tree. */
export function TreePanel({ draft, readOnly }: { draft: CodebookDraft; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-2 overflow-auto rounded-xl border border-border bg-card px-1 pt-3 shadow-xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Codebook Items ({flattenTree(draft.items).length})
        </span>
      </div>

      {draft.items.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {readOnly ? "This version has no items." : "No items yet."}
        </p>
      )}

      <div className="flex-1 scroll-pt-10 overflow-y-auto">
        <CodebookTreeView
          items={draft.items}
          selected={draft.selected}
          onSelect={draft.select}
          onAdd={draft.insertAt}
          onDelete={draft.remove}
          onMove={draft.move}
          validationIssues={draft.validationErrors}
          changed={draft.changed}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
