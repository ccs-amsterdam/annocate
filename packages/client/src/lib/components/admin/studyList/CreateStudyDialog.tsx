import { useState, type FormEvent } from "react";
import type { StudyResponse } from "@annotinder/contracts";
import { ResearcherApiError, type ResearcherApi } from "../../../api/httpResearcherApi";
import { useCreateStudyMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** An empty study: just a name. */
export function CreateStudyDialog({
  client,
  onClose,
  onCreated,
}: {
  client: ResearcherApi;
  onClose: () => void;
  onCreated: (study: StudyResponse) => void;
}) {
  const createStudy = useCreateStudyMutation(client);
  const [name, setName] = useState("");
  const error = createStudy.error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createStudy.mutate({ name: name.trim(), archived: false }, { onSuccess: onCreated });
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm fade-in">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Create New Study</h2>
        <p className="mt-1 text-sm text-muted-foreground">Enter a descriptive name for your annotation study.</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Study Name</label>
            <Input
              autoFocus
              placeholder="e.g. Sentiment Analysis Phase 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">
              {error instanceof ResearcherApiError ? error.reason : error.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={createStudy.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createStudy.isPending || !name.trim()}>
              {createStudy.isPending ? "Creating..." : "Create Study"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
