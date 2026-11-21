import { InfoTip } from "@/components/ui/info-tip";
import { flattenTree } from "../../../codebook/tree";
import { DesignTreeView } from "../DesignTreeView";
import type { DesignDraft } from "./useDesignDraft";
import { SessionHeader } from "./SessionHeader";

/** Left column of the visual editor: the item tree. */
export function TreePanel({ draft, readOnly }: { draft: DesignDraft; readOnly: boolean }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card px-1 pt-2 shadow-xs">
      <SessionHeader draft={draft} readOnly={readOnly} />
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
          Items ({flattenTree(draft.items).filter((i) => i.type !== "session" && i.type !== "unit_loop").length})
        </span>
        {!readOnly && draft.items.length > 1 && (
          <InfoTip label="How to edit the tree">
            Hover an item to add one below it, or tick items to move or delete them.
          </InfoTip>
        )}
      </div>

      {draft.items.every((i) => i.type === "session") && readOnly && (
        <p className="p-4 text-center text-sm text-muted-foreground">This version has no items.</p>
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
