import { useState } from "react";
import type { CodebookResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCodebookQuery, useCodebooksQuery, useDeleteCodebookMutation } from "../../admin/queries";
import { CodebookEditor } from "./CodebookEditor";
import { Button } from "@/components/ui/button";

/**
 * Codebook list/picker (design plan §5.3): a job can have multiple
 * codebooks; once a codebook is `immutable` (in use by a coder), it can no
 * longer be edited in place -- "duplicate as new" (edit a copy, save as a
 * brand new codebook) replaces edit-in-place for those.
 */
export function CodebookManager({ client }: { client: AdminClient }) {
  const codebooksQuery = useCodebooksQuery(client);
  const deleteCodebook = useDeleteCodebookMutation(client);
  const [editing, setEditing] = useState<number | "new" | "duplicate" | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<CodebookResponse | null>(null);

  const editingCodebookQuery = useCodebookQuery(client, typeof editing === "number" ? editing : null);

  if (editing !== null) {
    const codebook: CodebookResponse | null =
      editing === "new"
        ? null
        : editing === "duplicate"
          ? duplicateSource
            ? { ...duplicateSource, id: -1, immutable: false, name: `${duplicateSource.name} (copy)` }
            : null
          : (editingCodebookQuery.data ?? null);
    if (editing !== "new" && editing !== "duplicate" && !editingCodebookQuery.data) {
      return <p className="text-sm text-muted-foreground">Loading codebook...</p>;
    }
    return (
      <CodebookEditor
        // Keyed by the codebook's identity so a fresh CodebookEditor
        // instance (with fresh internal `name`/`items` draft state) mounts
        // whenever a different codebook is opened for editing, rather than
        // CodebookEditor needing a `useEffect` to notice the `codebook` prop
        // changed and resync its draft (design plan §6.5).
        key={editing === "new" ? "new" : editing === "duplicate" ? "duplicate" : editing}
        client={client}
        codebook={editing === "new" ? null : codebook}
        onCancel={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Codebooks</h2>
        <Button onClick={() => setEditing("new")}>+ New codebook</Button>
      </div>
      {codebooksQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      <div className="flex flex-col gap-1">
        {(codebooksQuery.data ?? []).map((cb) => (
          <div key={cb.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
            <span className="flex-1">
              <strong>{cb.name}</strong>
              {cb.immutable && <span className="ml-2 text-xs text-muted-foreground">(immutable -- in use)</span>}
            </span>
            <Button variant="outline" size="sm" onClick={() => setEditing(cb.id)}>
              {cb.immutable ? "View" : "Edit"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const full = await client.getCodebook(cb.id);
                setDuplicateSource(full);
                setEditing("duplicate");
              }}
            >
              Duplicate
            </Button>
            {!cb.immutable && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete codebook "${cb.name}"?`)) deleteCodebook.mutate(cb.id);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        ))}
        {codebooksQuery.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No codebooks yet -- create one to get started.</p>
        )}
      </div>
    </div>
  );
}
