import { useEffect, useRef, useState } from "react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useDesignVersionsQuery,
  useDesignVersionQuery,
  useCreateDesignVersionMutation,
  useDeleteDesignVersionMutation,
  useDeploymentQuery,
  useUpdateDesignVersionMutation,
  useStudyQuery,
} from "../../admin/queries";
import { describeVersions, draftMadeMeanwhile, editorMode, type OpenVersion } from "../../design/versions";
import { DesignEditor, type SaveFn } from "./DesignEditor";
import { DesignStatusBanner } from "./DesignStatusBanner";
import { DesignVersionsDialog } from "./DesignVersionsDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearBackup, type DesignBackup } from "../../design/localBackup";

interface DesignManagerProps {
  client: ResearcherApi;
  /** Callback to notify parent (AdminApp) if there are unsaved changes */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Receives the editor's save function, so the parent can save before navigating away. */
  registerSave?: (save: SaveFn | null) => void;
  /** Version to open first (e.g. from the overview); null opens the current version. */
  initialVersionId?: number | null;
  /** Unsaved edits from an earlier session to continue with (localBackup.ts), on the current version. */
  restore?: DesignBackup | null;
  /** The version to open by its number (v1, v2, ...: the URL's `?version=`), if not `initialVersionId`. */
  initialVersion?: number;
  /** The open version changed: its number, or undefined for the current version (the URL follows). */
  onVersionChange?: (version: number | undefined) => void;
  /** To the Deploy page (deploying happens there). */
  onOpenDeploy?: () => void;
}

/**
 * The version to open first: a number is its id, null follows the current
 * version (the draft, else the latest), undefined is the URL's version
 * number (`initialVersion`), known once the versions are. Unsaved edits to
 * continue with go on the current version.
 */
function firstChosen({
  restore,
  initialVersionId,
  initialVersion,
}: Pick<DesignManagerProps, "restore" | "initialVersionId" | "initialVersion">): number | null | undefined {
  if (restore) return null;
  if (initialVersionId != null) return initialVersionId;
  return initialVersion !== undefined ? undefined : null;
}

/**
 * The Design page (the design editor): one editor on the current version, a banner saying how it
 * relates to what coders use, and the versions dialog.
 *
 * Versions (docs/client.md §7): coders get the *live* version
 * (the deployment's design version), the editor works on the *draft* (the latest
 * version, if not yet deployed), and everything else is read-only history.
 * Deploying (on the Deploy page) makes the draft live, which also freezes it.
 */
export function DesignManager({
  client,
  onDirtyChange,
  registerSave,
  initialVersionId = null,
  restore = null,
  initialVersion,
  onVersionChange,
  onOpenDeploy,
}: DesignManagerProps) {
  const studyId = client.studyId ?? 0;
  const designVersionsQuery = useDesignVersionsQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const designVersions = designVersionsQuery.data ?? [];
  const versions = describeVersions(designVersions, deploymentQuery.data?.designVersionId ?? null);

  // The version shown in the editor (see `firstChosen`)
  const [chosenId, setChosenId] = useState(() => firstChosen({ restore, initialVersionId, initialVersion }));
  // The URL's version by its number: undefined until the versions are known, null if there is none (or it is the current one)
  const urlId = designVersionsQuery.data
    ? (designVersionsQuery.data[(initialVersion ?? 0) - 1]?.id ?? null)
    : undefined;
  const fromUrl = chosenId === undefined && urlId === undefined;
  const selectedId = chosenId !== undefined ? chosenId : urlId === versions.currentId ? null : (urlId ?? null);
  // The backup is used by the first editor only: later ones start from what is saved
  const [pendingRestore, setPendingRestore] = useState(restore);
  // The open version, in the URL (the current one: none)
  const shownNumber = selectedId === null ? undefined : (versions.numberOf(selectedId) ?? undefined);
  useEffect(() => {
    if (!fromUrl) onVersionChange?.(shownNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the open version changes
  }, [shownNumber, fromUrl]);
  // Unsaved edits stay on the version they are of, whatever becomes the current one meanwhile
  // (a draft made by a colleague, or by an upload in another tab)
  const [pinned, setPinned] = useState<{ id: number | null } | null>(null);
  const followedId = fromUrl ? null : (selectedId ?? versions.currentId);
  const openId = pinned ? pinned.id : followedId;
  const openQuery = useDesignVersionQuery(client, openId);
  const studyQuery = useStudyQuery(client);
  const study = studyQuery.data ?? null;

  // Bumped when the open version's content is replaced underneath the editor (restore)
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);

  const createDesignVersion = useCreateDesignVersionMutation(client);
  const updateDesignVersion = useUpdateDesignVersionMutation(client);
  const deleteDesignVersion = useDeleteDesignVersionMutation(client);

  // Unsaved changes tracking
  const saveRef = useRef<SaveFn | null>(null);
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pendingSaving, setPendingSaving] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  function setIsDirty(dirty: boolean) {
    setIsDirtyInternal(dirty);
    setPinned((p) => (dirty ? (p ?? { id: openId }) : null));
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

  const openVersion = openId === null ? null : (openQuery.data ?? null);
  const open: OpenVersion = { id: openId, immutable: openVersion?.immutable, pinned: pinned !== null };
  const mode = editorMode(open, versions);
  const openNumber = openId === null ? null : (versions.numberOf(openId) ?? designVersions.length + 1);
  const liveNumber = versions.liveId === null ? null : versions.numberOf(versions.liveId);
  const draftNumber = versions.draftId === null ? null : versions.numberOf(versions.draftId);

  function viewVersion(id: number) {
    requestNavigation(() => setChosenId(id === versions.currentId ? null : id));
  }

  /** Copies a version into the draft (replacing the draft's content, if there is one). */
  function restoreVersion(id: number) {
    // Asked first: cancelling it after unsaved edits were discarded would leave them untracked
    if (
      versions.draftId !== null &&
      !confirm(`Replace the draft (v${draftNumber}) with the content of v${versions.numberOf(id)}?`)
    )
      return;
    requestNavigation(async () => {
      try {
        const source = await client.getDesignVersion(id);
        const body = { items: source.items, session: source.session, public: source.public };
        if (versions.draftId !== null) {
          await updateDesignVersion.mutateAsync({ id: versions.draftId, body });
          setChosenId(null);
        } else {
          const created = await createDesignVersion.mutateAsync(body);
          setChosenId(created.id);
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
      `for everyone who edits this design. This can't be undone.` +
      (isDirty && openId === versions.draftId ? " Your unsaved changes are lost too." : "");
    if (!confirm(message)) return;
    try {
      await deleteDesignVersion.mutateAsync(versions.draftId);
    } catch (e) {
      alert(`Could not delete the draft: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setVersionsDialogOpen(false);
    clearBackup(studyId);
    setIsDirty(false);
    setChosenId(null);
    setEditorEpoch((n) => n + 1);
  }

  const loadError =
    (study ? null : studyQuery.error) ??
    (designVersionsQuery.data ? null : designVersionsQuery.error) ??
    (deploymentQuery.data !== undefined ? null : deploymentQuery.error) ??
    (openId !== null && !openVersion ? openQuery.error : null);
  if (loadError) {
    // A version that can't be opened (e.g. deleted since): the current one can
    const toCurrent = selectedId !== null ? () => setChosenId(null) : undefined;
    return <LoadError error={loadError} onOpenCurrent={toCurrent} />;
  }

  // The study too: the editor starts a design for its kind of coders
  if (
    !study ||
    fromUrl ||
    designVersionsQuery.isLoading ||
    deploymentQuery.isLoading ||
    (openId !== null && !openVersion)
  ) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading design...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <DesignEditor
          key={`${openId ?? "new"}:${editorEpoch}`}
          client={client}
          coderKind={study.coderKind}
          version={openVersion}
          versionNumber={openId === null ? null : versions.numberOf(openId)}
          mode={mode}
          registerSave={(save) => {
            saveRef.current = save;
            registerSave?.(save);
          }}
          banner={
            <DesignStatusBanner
              mode={mode}
              openNumber={openNumber}
              liveNumber={liveNumber}
              draftNumber={draftNumber}
              onRestore={openId !== null ? () => restoreVersion(openId) : undefined}
              onBackToCurrent={() => viewVersion(versions.currentId ?? -1)}
              onOpenDeploy={onOpenDeploy}
            />
          }
          onDirtyChange={setIsDirty}
          onOpenVersions={() => setVersionsDialogOpen(true)}
          onSaved={(saved) => {
            setIsDirty(false);
            setChosenId(saved.id);
          }}
          restore={pendingRestore}
          onRestored={() => setPendingRestore(null)}
          newerDraft={draftMadeMeanwhile(open, designVersions, versions)}
          onReload={async () => {
            await openQuery.refetch();
            clearBackup(studyId);
            setIsDirty(false);
            setEditorEpoch((n) => n + 1);
          }}
        />
      </div>

      <DesignVersionsDialog
        open={versionsDialogOpen}
        onClose={() => setVersionsDialogOpen(false)}
        designVersions={designVersions}
        versions={versions}
        openId={openId}
        onView={viewVersion}
        onRestore={restoreVersion}
        onDeleteDraft={() => void deleteDraft()}
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
          clearBackup(studyId);
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

/** The design (its versions, or the one to open) couldn't be loaded. */
function LoadError({ error, onOpenCurrent }: { error: Error; onOpenCurrent?: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm">
      <p className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5 shrink-0" />
        Could not load the design: {error.message}
      </p>
      {onOpenCurrent && (
        <Button size="sm" variant="outline" onClick={onOpenCurrent}>
          Open the current version
        </Button>
      )}
    </div>
  );
}
