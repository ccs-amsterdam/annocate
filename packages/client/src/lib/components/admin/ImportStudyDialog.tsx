import { useState } from "react";
import type { StudyResponse } from "@annotinder/contracts";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateStudyFromRecipeMutation } from "../../admin/queries";
import { readDesignFile, type DesignImport } from "../../admin/designImport";

/**
 * "New study from a file" (docs/client.md §7): a design file (.json) makes
 * a study with that design as a draft, and no units yet.
 */
export function ImportStudyDialog({
  client,
  onCreated,
  onClose,
}: {
  client: ResearcherApi;
  onCreated: (study: StudyResponse) => void;
  onClose: () => void;
}) {
  const create = useCreateStudyFromRecipeMutation(client);
  const [read, setRead] = useState<DesignImport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function choose(file: File | undefined) {
    setRead(null);
    setProblem(null);
    create.reset();
    if (!file) return;
    setFileName(file.name);
    try {
      const result = readDesignFile(new Uint8Array(await file.arrayBuffer()));
      setRead(result);
      setName(result.recipe.name);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <h2 id="import-title" className="text-lg font-semibold text-foreground">
          New study from a file
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A design file (from a study&apos;s download, designs/v1.json, or Export › Design file in the editor) makes a
          study with that design, to add units to.
        </p>

        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-5 text-center text-sm hover:border-primary/50">
          <FileUp className="h-6 w-6 text-primary" />
          <span className="font-medium text-foreground">{fileName ?? "Choose a design file (.json)"}</span>
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Design file"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>

        {problem && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {problem}
          </p>
        )}

        {read && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm" data-testid="import-summary">
            <p>
              A design with {read.items} item{read.items === 1 ? "" : "s"} at the top, as a draft. No units: upload them
              in the new study.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Made with AnnoTinder {read.release}. Deploy the design to get links for coders.
            </p>
          </div>
        )}

        <form
          className="mt-4 space-y-3 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!read || !name.trim()) return;
            create.mutate({ ...read.recipe, name: name.trim() }, { onSuccess: onCreated });
          }}
        >
          <label className="block text-xs font-medium text-muted-foreground">
            Study name
            <Input
              className="mt-1"
              value={name}
              disabled={!read}
              onChange={(e) => setName(e.target.value)}
              placeholder="Choose a file first"
            />
          </label>
          {create.isError && (
            <p className="text-xs text-destructive">
              {create.error instanceof ResearcherApiError ? create.error.reason : create.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!read || !name.trim() || create.isPending}>
              {create.isPending ? "Creating..." : "Create study"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
