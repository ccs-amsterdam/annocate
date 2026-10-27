import { flattenTree } from "../../../codebook/tree";
import { CodebookTreeView } from "../CodebookTreeView";
import type { CodebookDraft } from "./useCodebookDraft";

/** Left column of the visual editor: the item tree. */
export function TreePanel({ draft, readOnly }: { draft: CodebookDraft; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-2 overflow-auto rounded-xl border border-border bg-card p-3 shadow-xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Codebook Items ({flattenTree(draft.items).length})
        </span>
      </div>

      {draft.items.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {readOnly ? "This version has no items." : "No items yet. Add an item below to get started."}
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        <CodebookTreeView
          items={draft.items}
          selected={draft.selected}
          onSelect={draft.select}
          onInsertBefore={draft.insertBefore}
          onInsertAtEnd={draft.insertAtEnd}
          onDelete={draft.remove}
          onMoveItem={draft.move}
          onMoveToRootEnd={draft.moveToEnd}
          validationIssues={draft.validationErrors}
          changed={draft.changed}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
