import { useState } from "react";
import type { CodebookMeta, CodebookResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodebooksQuery, useCodebookQuery } from "../../admin/queries";
import { CodebookEditor } from "./CodebookEditor";
import { CodebookVersionsDialog } from "./CodebookVersionsDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, GitBranch } from "lucide-react";

interface CodebookManagerProps {
  client: AdminClient;
  /** Callback to notify parent (AdminApp) if there are unsaved changes */
  onDirtyChange?: (isDirty: boolean) => void;
}

/**
 * Single-tab codebook manager with version history modal dialog.
 * Shows the active codebook version in full height by default, with a "Versions"
 * button in the editor action bar providing a complete overview of versions,
 * timestamps, active status, immutability, and provenance settings.
 */
export function CodebookManager({ client, onDirtyChange }: CodebookManagerProps) {
  const codebooksQuery = useCodebooksQuery(client);
  const codebooks = codebooksQuery.data ?? [];

  // Currently selected codebook ID for inspection/editing, or "new" / "duplicate", or null (default to latest)
  const [selectedVersionId, setSelectedVersionId] = useState<number | "new" | "duplicate" | null>(null);

  // When duplicating an existing codebook to make a new draft
  const [duplicateSource, setDuplicateSource] = useState<CodebookResponse | null>(null);

  // Versions overview modal state
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);

  // Unsaved changes tracking
  const [isDirty, setIsDirtyInternal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  function setIsDirty(dirty: boolean) {
    setIsDirtyInternal(dirty);
    onDirtyChange?.(dirty);
  }

  // Intercept version changes if unsaved edits exist
  function requestNavigation(action: () => void) {
    if (isDirty) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  // The latest codebook is the active version
  const latestCodebookId = codebooks.length > 0 ? codebooks[codebooks.length - 1].id : null;

  // The active version: if user hasn't explicitly chosen a version, default to the latest codebook
  const currentVersion: number | "new" | "duplicate" =
    selectedVersionId !== null
      ? selectedVersionId
      : latestCodebookId !== null
        ? latestCodebookId
        : "new";

  // Active codebook ID to fetch
  const activeId = typeof currentVersion === "number" ? currentVersion : null;
  const activeCodebookQuery = useCodebookQuery(client, activeId);

  function handleCreateNewVersion() {
    requestNavigation(() => {
      // If we have an active codebook, clone it as initial draft for the new version
      if (activeCodebook) {
        setDuplicateSource({
          ...activeCodebook,
          id: -1,
          name: `${activeCodebook.name} (v${codebooks.length + 1})`,
          immutable: false,
        });
        setSelectedVersionId("duplicate");
      } else {
        setSelectedVersionId("new");
      }
    });
  }

  function handleSelectVersion(targetId: number) {
    requestNavigation(() => {
      setSelectedVersionId(targetId);
      setDuplicateSource(null);
    });
  }

  async function handleDuplicateVersion(meta: CodebookMeta) {
    requestNavigation(async () => {
      try {
        const full = await client.getCodebook(meta.id);
        setDuplicateSource({
          ...full,
          id: -1,
          name: `${full.name} (v${codebooks.length + 1})`,
          immutable: false,
        });
        setSelectedVersionId("duplicate");
      } catch (e) {
        console.error("Failed to duplicate codebook version", e);
      }
    });
  }

  if (codebooksQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading codebooks...
      </div>
    );
  }

  // If no codebooks exist yet for this job
  if (codebooks.length === 0 && currentVersion !== "new") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          <GitBranch className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">No Codebook Yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Create your first codebook to define annotation questions, unit loops, and variables for this job.
          </p>
        </div>
        <Button onClick={() => setSelectedVersionId("new")} className="mt-2">
          <Plus className="mr-1.5 h-4 w-4" />
          Create Codebook
        </Button>
      </div>
    );
  }

  const activeCodebook: CodebookResponse | null =
    currentVersion === "new"
      ? null
      : currentVersion === "duplicate"
        ? duplicateSource
        : (activeCodebookQuery.data ?? null);

  if (currentVersion !== "new" && currentVersion !== "duplicate" && !activeCodebook) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading codebook version...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Full-height embedded Codebook Editor with non-intrusive Versions button */}
      <div className="flex-1 overflow-hidden">
        <CodebookEditor
          key={currentVersion === "new" ? "new" : currentVersion === "duplicate" ? "duplicate" : currentVersion}
          client={client}
          codebook={currentVersion === "new" ? null : activeCodebook}
          onDirtyChange={setIsDirty}
          onOpenVersions={() => setVersionsDialogOpen(true)}
          onSaved={(saved) => {
            setIsDirty(false);
            setSelectedVersionId(saved.id);
            setDuplicateSource(null);
          }}
        />
      </div>

      {/* Overview Modal Dialog for Codebook Versions & Provenance */}
      <CodebookVersionsDialog
        open={versionsDialogOpen}
        onClose={() => setVersionsDialogOpen(false)}
        codebooks={codebooks}
        currentVersion={currentVersion}
        latestCodebookId={latestCodebookId}
        onSelectVersion={handleSelectVersion}
        onCreateNewVersion={handleCreateNewVersion}
        onDuplicateVersion={handleDuplicateVersion}
      />

      {/* Unsaved changes confirmation dialog */}
      <UnsavedChangesDialog
        open={pendingAction !== null}
        onCancel={() => setPendingAction(null)}
        onDiscard={() => {
          setIsDirty(false);
          const act = pendingAction;
          setPendingAction(null);
          act?.();
        }}
        onSave={() => {
          setPendingAction(null);
        }}
      />
    </div>
  );
}
