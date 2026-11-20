import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StudyResponse } from "@annotinder/contracts";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateStudyFromRecipeMutation } from "../../admin/queries";
import { readDesignFile, readExportSummary, type DesignImport, type ExportSummary } from "../../admin/designImport";

type Chosen = { kind: "export"; bytes: Uint8Array; summary: ExportSummary } | { kind: "design"; design: DesignImport };

/**
 * "New study from a file" (docs/client.md §7): a study export
 * (`.annotinder.gz`, from a study's Settings) makes a copy of that study,
 * with or without its coders and answers; a design file (.json) makes a
 * study with that design as a draft, and no units yet.
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
  const queryClient = useQueryClient();
  const fromDesign = useCreateStudyFromRecipeMutation(client);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [withCoders, setWithCoders] = useState(true);
  const [busy, setBusy] = useState(false);

  async function choose(file: File | undefined) {
    setChosen(null);
    setProblem(null);
    fromDesign.reset();
    if (!file) return;
    setFileName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // A gzip file (1f 8b) is a study export; anything else is read as a design file
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const summary = readExportSummary(bytes);
        setChosen({ kind: "export", bytes, summary });
        setName(summary.name);
      } else {
        const design = readDesignFile(bytes);
        setChosen({ kind: "design", design });
        setName(design.recipe.name);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }

  async function create() {
    if (!chosen || !name.trim()) return;
    if (chosen.kind === "design") {
      fromDesign.mutate({ ...chosen.design.recipe, name: name.trim() }, { onSuccess: onCreated });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const study = await client.importStudy(chosen.bytes, { name: name.trim(), coders: withCoders });
      void queryClient.invalidateQueries({ queryKey: ["admin", "studies"] });
      onCreated(study);
    } catch (e) {
      setProblem(e instanceof ResearcherApiError ? e.reason : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const pending = busy || fromDesign.isPending;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
          A study export (.annotinder.gz, from a study&apos;s Settings) makes a copy of that study, with its coders and
          answers if you like. A design file (.json, from a download or the editor&apos;s Export menu) makes a study
          with that design, to add units to.
        </p>

        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-5 text-center text-sm hover:border-primary/50">
          <FileUp className="h-6 w-6 text-primary" />
          <span className="font-medium text-foreground">{fileName ?? "Choose a study export or a design file"}</span>
          <input
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            className="sr-only"
            aria-label="Study export or design file"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>

        {problem && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {problem}
          </p>
        )}

        {chosen?.kind === "export" && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm" data-testid="import-summary">
            <p>
              A study export: {plural(chosen.summary.units, "unit")},{" "}
              {plural(chosen.summary.designVersions, "design version")}, {plural(chosen.summary.coders, "coder")} with{" "}
              {plural(chosen.summary.answers, "answer")}.
            </p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={withCoders} onChange={(e) => setWithCoders(e.target.checked)} />
              With the coders and their answers
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Exported {new Date(chosen.summary.exportedAt).toLocaleString()} with AnnoTinder {chosen.summary.release}.
              Links get new addresses: send coders the new ones.
            </p>
          </div>
        )}
        {chosen?.kind === "design" && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm" data-testid="import-summary">
            <p>
              A design with {plural(chosen.design.items, "item")} at the top, as a draft. No units: upload them in the
              new study.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Made with AnnoTinder {chosen.design.release}. Deploy the design to get links for coders.
            </p>
          </div>
        )}

        <form
          className="mt-4 space-y-3 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="block text-xs font-medium text-muted-foreground">
            Study name
            <Input
              className="mt-1"
              value={name}
              disabled={!chosen}
              onChange={(e) => setName(e.target.value)}
              placeholder="Choose a file first"
            />
          </label>
          {fromDesign.isError && (
            <p className="text-xs text-destructive">
              {fromDesign.error instanceof ResearcherApiError ? fromDesign.error.reason : fromDesign.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!chosen || !name.trim() || pending}>
              {pending ? "Creating..." : "Create study"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
