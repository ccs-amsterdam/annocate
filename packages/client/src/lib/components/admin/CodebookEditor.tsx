import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CodebookResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useUnitFieldsQuery } from "../../admin/queries";
import { unknownUnitFields } from "../../codebook/unitFieldRefs";
import { CodebookYamlEditor } from "./CodebookYamlEditor";
import { useCodebookDraft } from "./codebookEditor/useCodebookDraft";
import { EditorToolbar, type EditorIssue, type EditorView } from "./codebookEditor/EditorToolbar";
import { findItem, itemAtPath, keyOf } from "../../codebook/tree";
import { TreePanel } from "./codebookEditor/TreePanel";
import { ItemPanel } from "./codebookEditor/ItemPanel";

/**
 * How the opened version can be edited (docs/client.md §7):
 * - draft:   saving updates it (or creates it, for a new codebook).
 * - live:    the live version, with no draft yet. Editable, but saving
 *            creates a new codebook: the draft. Coders keep the live version.
 * - history: an older version, read only.
 */
export type CodebookEditorMode = "draft" | "live" | "history";

/** The editor's save function, for a parent to save from e.g. an "unsaved changes" dialog. */
export type SaveFn = () => Promise<CodebookResponse>;

interface CodebookEditorProps {
  client: ResearcherApi;
  /** The version to edit; null/undefined for a new codebook. Mount with a `key` per version. */
  codebook?: CodebookResponse | null;
  mode?: CodebookEditorMode;
  /** Shown below the toolbar: what version this is and what to do next. */
  banner?: ReactNode;
  onSaved: (codebook: CodebookResponse) => void;
  /** Shows a Publish button; called with the saved version (unsaved changes are saved first). */
  onPublish?: (codebook: CodebookResponse) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onOpenVersions?: () => void;
  /** Receives the editor's save function (and null on unmount). */
  registerSave?: (save: SaveFn | null) => void;
}

/**
 * Whole-document codebook editor (docs/client.md §7): holds one in-memory
 * copy of the items (`useCodebookDraft`), edited purely client-side, and
 * saved in one `PUT`/`POST /codebook` call.
 *
 * Parts (see ./codebookEditor):
 * - useCodebookDraft  items, selection, validation, unsaved changes, saving
 * - EditorToolbar     issue count, Visual/YAML toggle, Versions/Save/Publish
 * - TreePanel         the item tree (left)
 * - ItemPanel         the selected item's form or preview (right)
 */
export function CodebookEditor({
  client,
  codebook,
  mode = "draft",
  banner,
  onSaved,
  onPublish,
  onDirtyChange,
  onOpenVersions,
  registerSave,
}: CodebookEditorProps) {
  const readOnly = mode === "history";
  const draft = useCodebookDraft({ client, codebook, readOnly, onSaved });
  const [view, setView] = useState<EditorView>("tree");
  const unitFieldsQuery = useUnitFieldsQuery(client);
  // Warnings, not errors: units may still be uploaded after the codebook is written
  const warnings = useMemo(
    () => unknownUnitFields(draft.cleanItems, unitFieldsQuery.data ?? []),
    [draft.cleanItems, unitFieldsQuery.data],
  );

  const errors = useMemo<EditorIssue[]>(
    () =>
      draft.validationErrors.map((issue) => ({
        message: issue.message,
        item: itemAtPath(draft.items, issue.path)?.name ?? null,
        target: { path: issue.path },
      })),
    [draft.validationErrors, draft.items],
  );
  const warningIssues = useMemo<EditorIssue[]>(
    () => warnings.map((w) => ({ message: w.message, item: w.item, target: { name: w.item } })),
    [warnings],
  );

  /** Opens the item an issue is about, in the visual editor. */
  function openIssue(issue: EditorIssue) {
    const target = issue.target;
    const item = !target ? null : "path" in target ? itemAtPath(draft.items, target.path) : findItem(draft.items, target.name);
    if (!item) return;
    draft.select(keyOf(item) ?? item.name);
    setView("tree");
  }

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
    // A live version that wasn't changed can't be published again; anything unsaved is saved first
    if (dirty || !codebook || codebook.immutable) onPublish(await draft.save());
    else onPublish(codebook);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <EditorToolbar
        mode={mode}
        view={view}
        onViewChange={setView}
        errors={errors}
        warnings={warningIssues}
        onOpenIssue={openIssue}
        dirty={dirty}
        canSave={draft.canSave}
        saving={draft.saving}
        onSave={() => void draft.save()}
        onPublish={onPublish && (() => void publish())}
        onOpenVersions={onOpenVersions}
      />

      {banner}

      {draft.saveError && <p className="text-sm text-destructive">{draft.saveError.message}</p>}

      {view === "yaml" ? (
        <div className="flex-1 overflow-hidden">
          <CodebookYamlEditor items={draft.cleanItems} onChange={draft.replaceAll} disabled={readOnly} />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
          <TreePanel draft={draft} readOnly={readOnly} />
          <ItemPanel client={client} draft={draft} readOnly={readOnly} warnings={warnings} />
        </div>
      )}
    </div>
  );
}
