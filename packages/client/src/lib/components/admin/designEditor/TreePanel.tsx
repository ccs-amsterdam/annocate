import { InfoTip } from "@/components/ui/info-tip";
import { flattenTree } from "../../../codebook/tree";
import { DesignTreeView } from "../DesignTreeView";
import type { DesignDraft } from "./useDesignDraft";

/** Left column of the visual editor: the item tree. */
export function TreePanel({ draft, readOnly }: { draft: DesignDraft; readOnly: boolean }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card px-1 pt-2 shadow-xs">
      <div className="flex items-center gap-1 border-b border-border/60 px-2 pb-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Items ({flattenTree(draft.items).length})</span>
        {!readOnly && draft.items.length > 0 && (
          <InfoTip label="How to edit the tree">Hover an item to add one below it, or tick items to move or delete them.</InfoTip>
        )}
      </div>

      {draft.items.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">
          {readOnly ? "This version has no items." : "No items yet."}
        </p>
      )}

      <div className="min-h-0 flex-1 scroll-pt-10 overflow-y-auto">
        <DesignTreeView
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
