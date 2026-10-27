import { useRef, useState } from "react";
import type { CodebookResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useCodebooksQuery,
  useCodebookQuery,
  useCreateCodebookMutation,
  useDeleteCodebookMutation,
  useDeploymentQuery,
  usePublishMutation,
  useUpdateCodebookMutation,
} from "../../admin/queries";
import { describeVersions } from "../../codebook/versions";
import { CodebookEditor, type CodebookEditorMode, type SaveFn } from "./CodebookEditor";
import { CodebookStatusBanner } from "./CodebookStatusBanner";
import { CodebookVersionsDialog } from "./CodebookVersionsDialog";
import { PublishDialog } from "./PublishDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Loader2 } from "lucide-react";
import { clearBackup, type CodebookBackup } from "../../codebook/localBackup";

interface CodebookManagerProps {
  client: ResearcherApi;
  /** Callback to notify parent (AdminApp) if there are unsaved changes */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Receives the editor's save function, so the parent can save before navigating away. */
  registerSave?: (save: SaveFn | null) => void;
  /** Version to open first (e.g. from the overview); null opens the current version. */
  initialVersionId?: number | null;
  /** Unsaved edits from an earlier session to continue with (localBackup.ts): opens their version. */
  restore?: CodebookBackup | null;
}

/**
 * The codebook tab: one editor on the current version, a banner saying how it
 * relates to what coders use, and the versions dialog.
 *
 * Versions (docs/client.md §7): coders get the *live* version
 * (the deployment's codebook), the editor works on the *draft* (the latest
 * version, if not yet published), and everything else is read-only history.
 * Publishing makes the draft live, which also freezes it.
 */
export function CodebookManager({ client, onDirtyChange, registerSave, initialVersionId = null, restore = null }: CodebookManagerProps) {
  const codebooksQuery = useCodebooksQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const codebooks = codebooksQuery.data ?? [];
  const versions = describeVersions(codebooks, deploymentQuery.data?.codebookId ?? null);

  // The version shown in the editor; null follows the current version (draft, else latest)
  const [selectedId, setSelectedId] = useState<number | null>(restore ? restore.codebookId : initialVersionId);
  // The backup is used by the first editor only: later ones start from what is saved
  const [pendingRestore, setPendingRestore] = useState(restore);
  const openId = selectedId ?? versions.currentId;
  const openQuery = useCodebookQuery(client, openId);
  const liveQuery = useCodebookQuery(client, versions.liveId);

  // Bumped when the open version's content is replaced underneath the editor (restore)
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  const [toPublish, setToPublish] = useState<CodebookResponse | null>(null);

  const createCodebook = useCreateCodebookMutation(client);
  const updateCodebook = useUpdateCodebookMutation(client);
  const deleteCodebook = useDeleteCodebookMutation(client);
  const publish = usePublishMutation(client);

  // Unsaved changes tracking
  const saveRef = useRef<SaveFn | null>(null);
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pendingSaving, setPendingSaving] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  function setIsDirty(dirty: boolean) {
    setIsDirtyInternal(dirty);
    onDirtyChange?.(dirty);
  }

  function requestNavigation(action: () => void) {
    if (isDirty) setPendingAction(() => action);
    else action();
  }

  async function saveAndContinue() {
    setPendingSaving(true);
    setPendingError(null);
    try {
      await saveRef.current?.();
      const action = pendingAction;
      setPendingAction(null);
      action?.();
    } catch (e) {
      setPendingError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingSaving(false);
    }
  }

  // An id that isn't listed yet was just created: it's the new current version
  const isListed = openId !== null && versions.numberOf(openId) !== null;
  const openCodebook = openId === null ? null : (openQuery.data ?? null);
  const mode: CodebookEditorMode =
    openId === null
      ? "draft"
      : isListed && openId !== versions.currentId
        ? "history"
        : openCodebook?.immutable
          ? "live"
          : "draft";
  const openNumber = openId === null ? null : (versions.numberOf(openId) ?? codebooks.length + 1);
  const liveNumber = versions.liveId === null ? null : versions.numberOf(versions.liveId);
  const draftNumber = versions.draftId === null ? null : versions.numberOf(versions.draftId);

  function viewVersion(id: number) {
    requestNavigation(() => setSelectedId(id === versions.currentId ? null : id));
  }

  /** Copies a version into the draft (replacing the draft's content, if there is one). */
  function restoreVersion(id: number) {
    requestNavigation(async () => {
      try {
        const source = await client.getCodebook(id);
        const body = { items: source.items };
        if (versions.draftId !== null) {
          if (!confirm(`Replace the draft (v${draftNumber}) with the content of v${versions.numberOf(id)}?`)) return;
          await updateCodebook.mutateAsync({ id: versions.draftId, body });
          setSelectedId(null);
        } else {
          const created = await createCodebook.mutateAsync(body);
          setSelectedId(created.id);
        }
        setIsDirty(false);
        setEditorEpoch((n) => n + 1);
      } catch (e) {
        alert(`Could not restore v${versions.numberOf(id)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  /** Deletes the draft: its saved changes are gone, for everyone. Only from the versions dialog. */
  async function deleteDraft() {
    if (versions.draftId === null) return;
    const message =
      `Delete draft v${draftNumber}? Everything saved in it since v${liveNumber ?? draftNumber} is deleted, ` +
      `for everyone who edits this codebook. This can't be undone.` +
      (isDirty && openId === versions.draftId ? " Your unsaved changes are lost too." : "");
    if (!confirm(message)) return;
    try {
      await deleteCodebook.mutateAsync(versions.draftId);
    } catch (e) {
      alert(`Could not delete the draft: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setVersionsDialogOpen(false);
    clearBackup();
    setIsDirty(false);
    setSelectedId(null);
    setEditorEpoch((n) => n + 1);
  }

  if (codebooksQuery.isLoading || deploymentQuery.isLoading || (openId !== null && !openCodebook)) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading codebook...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex-1 overflow-hidden">
        <CodebookEditor
          key={`${openId ?? "new"}:${editorEpoch}`}
          client={client}
          codebook={openCodebook}
          mode={mode}
          registerSave={(save) => {
            saveRef.current = save;
            registerSave?.(save);
          }}
          banner={
            <CodebookStatusBanner
              mode={mode}
              openNumber={openNumber}
              liveNumber={liveNumber}
              draftNumber={draftNumber}
              onRestore={openId !== null ? () => restoreVersion(openId) : undefined}
              onBackToCurrent={() => viewVersion(versions.currentId ?? -1)}
            />
          }
          onDirtyChange={setIsDirty}
          onOpenVersions={() => setVersionsDialogOpen(true)}
          onSaved={(saved) => {
            setIsDirty(false);
            setSelectedId(saved.id);
          }}
          onPublish={setToPublish}
          restore={pendingRestore && pendingRestore.codebookId === openId ? pendingRestore : null}
          onRestored={() => setPendingRestore(null)}
          onReload={async () => {
            await openQuery.refetch();
            setIsDirty(false);
            setEditorEpoch((n) => n + 1);
          }}
        />
      </div>

      <CodebookVersionsDialog
        open={versionsDialogOpen}
        onClose={() => setVersionsDialogOpen(false)}
        codebooks={codebooks}
        versions={versions}
        openId={openId}
        onView={viewVersion}
        onRestore={restoreVersion}
        onDeleteDraft={() => void deleteDraft()}
      />

      <PublishDialog
        key={toPublish?.id ?? "closed"}
        codebook={toPublish}
        versionNumber={toPublish ? (versions.numberOf(toPublish.id) ?? codebooks.length + 1) : 0}
        live={versions.liveId !== null ? (liveQuery.data ?? null) : null}
        liveNumber={liveNumber}
        onPublish={async (codebook, note) => {
          if (note !== (codebook.note ?? "")) {
            await updateCodebook.mutateAsync({ id: codebook.id, body: { note: note || undefined, items: codebook.items } });
          }
          const deployment = await publish.mutateAsync(codebook.id);
          setSelectedId(null);
          return deployment;
        }}
        onClose={() => setToPublish(null)}
      />

      <UnsavedChangesDialog
        open={pendingAction !== null}
        isSaving={pendingSaving}
        error={pendingError}
        onCancel={() => {
          setPendingAction(null);
          setPendingError(null);
        }}
        onDiscard={() => {
          clearBackup();
          setIsDirty(false);
          const action = pendingAction;
          setPendingAction(null);
          setPendingError(null);
          action?.();
        }}
        onSave={saveAndContinue}
      />
    </div>
  );
}
