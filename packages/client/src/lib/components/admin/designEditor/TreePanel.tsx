import { DesignTreeView } from "../DesignTreeView";
import type { DesignDraft } from "./useDesignDraft";
import { SessionHeader } from "./SessionHeader";

/** Left column of the visual editor: the item tree. */
export function TreePanel({ draft, readOnly }: { draft: DesignDraft; readOnly: boolean }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card px-1 pt-2 shadow-xs">
      <SessionHeader draft={draft} readOnly={readOnly} />

      {draft.items.every((i) => i.type === "session") && readOnly && (
        <p className="p-4 text-center text-sm text-muted-foreground">This version has no items.</p>
      )}

      <div className="min-h-0 flex-1 scroll-pt-10 overflow-y-auto">
        <DesignTreeView
          items={draft.items}
          selected={draft.selected}
          onSelect={draft.select}
          onAdd={draft.insertAt}
          onAddElse={draft.addElse}
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
