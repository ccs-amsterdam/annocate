import { useEffect, useMemo, useState, type ReactNode } from "react";
import { codebookMarkdown } from "../../design/codebookMarkdown";
import { RELEASE, designFile, splitSession, type DesignVersion } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useJobQuery, useUnitFieldsQuery } from "../../admin/queries";
import { unknownUnitFields } from "../../design/unitFieldRefs";
import { DesignJsonEditor } from "./DesignJsonEditor";
import { useDesignDraft } from "./designEditor/useDesignDraft";
import { EditorToolbar, type ChangedItem, type EditorIssue, type EditorView } from "./designEditor/EditorToolbar";
import { findItem, flattenTree, itemAtPath, keyOf } from "../../codebook/tree";
import { itemTitle } from "../../codebook/conditions";
import type { DesignBackup } from "../../design/localBackup";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TreePanel } from "./designEditor/TreePanel";
import { ItemPanel, PreviewPanel } from "./designEditor/ItemPanel";

/**
 * How the opened version can be edited (docs/client.md §7):
 * - draft:   saving updates it (or creates it, for a new design version).
 * - live:    the live version, with no draft yet. Editable, but saving
 *            creates a new design version: the draft. Coders keep the live version.
 * - history: an older version, read only.
 */
export type DesignEditorMode = "draft" | "live" | "history";

/** The editor's save function, for a parent to save from e.g. an "unsaved changes" dialog. */
export type SaveFn = () => Promise<DesignVersion>;

interface DesignEditorProps {
  client: ResearcherApi;
  /** The version's number as people see it (v1, v2, ...): in an exported design file. */
  versionNumber?: number | null;
  /** The version to edit; null/undefined for a new design version. Mount with a `key` per version. */
  version?: DesignVersion | null;
  mode?: DesignEditorMode;
  /** Shown below the toolbar: what version this is and what to do next. */
  banner?: ReactNode;
  onSaved: (version: DesignVersion) => void;
  /** Shows a Deploy button; called with the saved version (unsaved changes are saved first). */
  onPublish?: (version: DesignVersion) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onOpenVersions?: () => void;
  /** Receives the editor's save function (and null on unmount). */
  registerSave?: (save: SaveFn | null) => void;
  /** Loads the saved version again, dropping the editor's state (after a save conflict). */
  onReload?: () => void;
  /** Unsaved edits of this version from an earlier session, to continue with. */
  restore?: DesignBackup | null;
  /** Called once the editor started from `restore` (it is used once). */
  onRestored?: () => void;
}

/**
 * Whole-document design editor (docs/client.md §7): holds one in-memory
 * copy of the items (`useDesignDraft`), edited purely client-side, and
 * saved in one `PUT`/`POST /design` call.
 *
 * Parts (see ./designEditor):
 * - useDesignDraft  items, selection, validation, unsaved changes, saving
 * - EditorToolbar     issue count, Visual/JSON toggle, Versions/Save/Deploy
 * - TreePanel         the item tree (left)
 * - ItemPanel         the selected item's form or preview (right)
 * - PreviewPanel      on wide screens, the live preview in a third column
 */
/** Wide enough for the tree, the form and the preview side by side. */
const WIDE_SCREEN = "(min-width: 1500px)";
/** Phones: one pane at a time, the tree first; an item's form opens full width, with a way back. */
const NARROW_SCREEN = "(max-width: 767px)";

export function DesignEditor({
  client,
  versionNumber,
  version,
  mode = "draft",
  banner,
  onSaved,
  onPublish,
  onDirtyChange,
  onOpenVersions,
  registerSave,
  onReload,
  restore,
  onRestored,
}: DesignEditorProps) {
  const readOnly = mode === "history";
  const draft = useDesignDraft({ client, version, readOnly, onSaved, restore });
  const wide = useMediaQuery(WIDE_SCREEN);
  const narrow = useMediaQuery(NARROW_SCREEN);
  // On a narrow screen: the selected item, else the tree (Back deselects)
  const showItemOnly = narrow && draft.selectedItem !== null;
  const [view, setView] = useState<EditorView>("tree");
  const unitFieldsQuery = useUnitFieldsQuery(client);
  const jobName = useJobQuery(client).data?.name;
  // Warnings, not errors: units may still be uploaded after the design is written
  // (Fields the design doesn't declare are errors already, at the same items)
  const warnings = useMemo(
    () => unknownUnitFields(draft.cleanItems, unitFieldsQuery.data ?? []).filter((w) => !draft.undeclared.includes(w.field)),
    [draft.cleanItems, unitFieldsQuery.data, draft.undeclared],
  );

  const errors = useMemo<EditorIssue[]>(
    () =>
      draft.validationErrors.map((issue) => ({
        message: issue.message,
        item: ((at) => (at ? itemTitle(at) : null))(itemAtPath(draft.items, issue.path)),
        target: { path: issue.path },
      })),
    [draft.validationErrors, draft.items],
  );
  const warningIssues = useMemo<EditorIssue[]>(
    () => warnings.map((w) => ({ message: w.message, item: w.item, target: { name: w.item } })),
    [warnings],
  );

  const changedItems = useMemo<ChangedItem[]>(
    () =>
      flattenTree(draft.items).flatMap((item) => {
        const key = keyOf(item);
        return key && draft.changed.has(key) ? [{ key, name: itemTitle(item), isNew: !findItem(draft.savedItems, key) }] : [];
      }),
    [draft.items, draft.changed, draft.savedItems],
  );

  /** Opens the item an issue is about, in the visual editor. */
  function openIssue(issue: EditorIssue) {
    const target = issue.target;
    const item = !target ? null : "path" in target ? itemAtPath(draft.items, target.path) : findItem(draft.items, target.name);
    if (!item) return;
    draft.select(keyOf(item) ?? itemTitle(item));
    setView("tree");
  }

  const restored = Boolean(restore);
  useEffect(() => {
    if (restored) onRestored?.();
    // Only on mount: the draft took the backup as its initial state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { dirty } = draft;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    registerSave?.(draft.save);
    return () => registerSave?.(null);
  });

  async function publish() {
    if (!onPublish) return;
    // A live version that wasn't changed can't be deployed again; anything unsaved is saved first
    if (dirty || !version || version.immutable) onPublish(await draft.save());
    else onPublish(version);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <EditorToolbar
        status={banner}
        mode={mode}
        view={view}
        onViewChange={setView}
        errors={errors}
        warnings={warningIssues}
        onOpenIssue={openIssue}
        dirty={dirty}
        canSave={draft.canSave}
        valid={draft.valid}
        canUndo={draft.canUndo}
        canRedo={draft.canRedo}
        onUndo={draft.undo}
        onRedo={draft.redo}
        changedItems={changedItems}
        onRevertItem={draft.revert}
        onRevertAll={draft.revertAll}
        saving={draft.saving}
        onSave={() => void draft.save().catch(() => {})}
        onPublish={onPublish && (() => void publish().catch(() => {}))}
        onOpenVersions={onOpenVersions}
        onExport={async (kind) => {
          if (kind === "codebook") {
            download(codebookMarkdown(draft.cleanItems, "Codebook", version?.note), "codebook.md", "text/markdown");
            return;
          }
          // The whole design as a design file (contracts version.ts), as edited now, with this server's release
          const client_ = await client.getServerVersion().catch(() => ({ release: RELEASE, commit: "unknown" }));
          const { items, session } = splitSession(draft.cleanItems);
          const file = designFile(
            { items, session: session ?? null, units: version?.units ?? { fields: [] }, note: version?.note ?? null },
            { name: jobName ?? "design", version: versionNumber ?? null, client: client_ },
          );
          download(JSON.stringify(file, null, 2), "design.json", "application/json");
        }}
      />

      {draft.saveError && <p className="text-sm text-destructive">{draft.saveError.message}</p>}

      <Dialog open={draft.conflict !== null} onOpenChange={(open) => !open && draft.dismissConflict()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Someone else saved this draft</DialogTitle>
            <DialogDescription>
              {draft.conflict?.updatedBy ?? "Someone"} saved it at{" "}
              {draft.conflict ? new Date(draft.conflict.updated).toLocaleTimeString() : ""}, while you were editing. Saving
              yours replaces their changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            {onReload && (
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Throw away your unsaved changes and load the saved draft?")) onReload();
                }}
              >
                Discard mine, load theirs
              </Button>
            )}
            <Button onClick={() => void draft.save({ overwrite: true }).catch(() => {})}>Save mine over theirs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {view === "json" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <DesignJsonEditor items={draft.cleanItems} onChange={draft.replaceAll} disabled={readOnly} />
        </div>
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-3 overflow-hidden", narrow ? "grid-cols-1" : wide ? "grid-cols-[1fr_1.15fr_1fr]" : "grid-cols-2")}>
          {!showItemOnly && <TreePanel draft={draft} readOnly={readOnly} />}
          {(!narrow || showItemOnly) && (
            <ItemPanel
              client={client}
              draft={draft}
              readOnly={readOnly}
              warnings={warnings}
              previewBeside={wide}
              onBack={narrow ? () => draft.select(null) : undefined}
            />
          )}
          {wide && <PreviewPanel client={client} draft={draft} />}
        </div>
      )}
    </div>
  );
}

/** Saves text as a file (a download). */
function download(text: string, filename: string, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  // Revoked later: right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
