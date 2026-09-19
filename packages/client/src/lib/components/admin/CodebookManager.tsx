import { useState, useEffect } from "react";
import type { CodebookResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodebookQuery, useCodebooksQuery } from "../../admin/queries";
import { CodebookEditor } from "./CodebookEditor";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { GitBranch, Plus, History, Lock, CheckCircle, Loader2 } from "lucide-react";

/**
 * Codebook manager: a job has one active codebook.
 * By default, immediately shows the active codebook editor/viewer.
 * Allows viewing different historical versions and creating a new version
 * (forking an existing/immutable codebook).
 */
export function CodebookManager({
  client,
  onDirtyChange,
}: {
  client: AdminClient;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const codebooksQuery = useCodebooksQuery(client);

  // Selected codebook id: number for existing, "new" for brand new, "duplicate" for forked version
  const [selectedVersionId, setSelectedVersionId] = useState<number | "new" | "duplicate" | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<CodebookResponse | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const codebooks = codebooksQuery.data ?? [];

  // When codebooks load, default to the latest/active codebook if not set
  useEffect(() => {
    if (codebooks.length > 0 && selectedVersionId === null) {
      // Pick the latest codebook by ID
      const latest = codebooks[codebooks.length - 1];
      setSelectedVersionId(latest.id);
    }
  }, [codebooks, selectedVersionId]);

  // Forward dirty state to parent
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const activeId = typeof selectedVersionId === "number" ? selectedVersionId : null;
  const activeCodebookQuery = useCodebookQuery(client, activeId);

  function requestNavigation(action: () => void) {
    if (isDirty) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  async function handleCreateNewVersion() {
    requestNavigation(async () => {
      let source: CodebookResponse | null = null;
      if (typeof selectedVersionId === "number") {
        source = await client.getCodebook(selectedVersionId);
      } else if (codebooks.length > 0) {
        source = await client.getCodebook(codebooks[codebooks.length - 1].id);
      }

      if (source) {
        setDuplicateSource({
          ...source,
          id: -1,
          immutable: false,
          name: `${source.name.replace(/\s*\(v\d+\)$/, "")} (v${codebooks.length + 1})`,
        });
        setSelectedVersionId("duplicate");
      } else {
        setSelectedVersionId("new");
      }
    });
  }

  if (codebooksQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading codebook...
      </div>
    );
  }

  // If no codebooks exist yet for this job
  if (codebooks.length === 0 && selectedVersionId !== "new") {
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
    selectedVersionId === "new"
      ? null
      : selectedVersionId === "duplicate"
        ? duplicateSource
        : (activeCodebookQuery.data ?? null);

  if (selectedVersionId !== "new" && selectedVersionId !== "duplicate" && !activeCodebook) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading codebook version...
      </div>
    );
  }

  const currentCodebookMeta = codebooks.find((c) => c.id === activeId);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Codebook Version Navigation Header */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History className="h-4 w-4 text-primary" />
            <span>Version:</span>
          </div>

          {/* Version Dropdown Selector */}
          <select
            className="h-8 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground cursor-pointer"
            value={typeof selectedVersionId === "number" ? selectedVersionId : ""}
            onChange={(e) => {
              const targetId = Number(e.target.value);
              requestNavigation(() => {
                setSelectedVersionId(targetId);
                setDuplicateSource(null);
              });
            }}
          >
            {codebooks.map((cb, idx) => (
              <option key={cb.id} value={cb.id}>
                {cb.name} {cb.immutable ? "(Immutable)" : idx === codebooks.length - 1 ? "(Active)" : ""}
              </option>
            ))}
            {selectedVersionId === "duplicate" && <option value="">Draft (New Version)</option>}
            {selectedVersionId === "new" && <option value="">New Codebook</option>}
          </select>

          {currentCodebookMeta?.immutable && (
            <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              Locked (in use)
            </span>
          )}

          {!currentCodebookMeta?.immutable && selectedVersionId !== "duplicate" && selectedVersionId !== "new" && (
            <span className="flex items-center gap-1 rounded-md bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-600 dark:text-teal-400">
              <CheckCircle className="h-3 w-3" />
              Active Version
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreateNewVersion}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            Create new version
          </Button>
        </div>
      </div>

      {/* Embedded Codebook Editor */}
      <div className="flex-1 overflow-hidden">
        <CodebookEditor
          key={selectedVersionId === "new" ? "new" : selectedVersionId === "duplicate" ? "duplicate" : selectedVersionId}
          client={client}
          codebook={selectedVersionId === "new" ? null : activeCodebook}
          onDirtyChange={setIsDirty}
          onCancel={() => {
            setIsDirty(false);
            if (codebooks.length > 0) {
              setSelectedVersionId(codebooks[codebooks.length - 1].id);
            }
          }}
          onSaved={(saved) => {
            setIsDirty(false);
            setSelectedVersionId(saved.id);
            setDuplicateSource(null);
          }}
        />
      </div>

      {/* Unsaved Changes Confirmation Modal for version navigation */}
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
