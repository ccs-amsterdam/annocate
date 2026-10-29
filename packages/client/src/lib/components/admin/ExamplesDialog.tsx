import { useState } from "react";
import type { JobResponse } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateJobFromExampleMutation, useExamplesQuery } from "../../admin/queries";

/**
 * "New job from an example" (docs/plans/examples.md): the examples by
 * category; the chosen one becomes an ordinary job, published, with an
 * invitation and sometimes example answers.
 */
export function ExamplesDialog({ client, onCreated, onClose }: { client: ResearcherApi; onCreated: (job: JobResponse) => void; onClose: () => void }) {
  const examplesQuery = useExamplesQuery(client);
  const create = useCreateJobFromExampleMutation(client);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const examples = examplesQuery.data ?? [];
  const categories = [...new Set(examples.map((e) => e.category))];
  const example = examples.find((e) => e.id === chosen);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">New job from an example</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An example makes a ready job: units, a published codebook and an invitation link, sometimes with example answers. It is yours
          to try, change and delete.
        </p>
        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          {examplesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading examples...</p>}
          {categories.map((category) => (
            <section key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</h3>
              <div className="grid gap-2">
                {examples
                  .filter((e) => e.category === category)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={chosen === e.id}
                      onClick={() => {
                        setChosen(e.id);
                        setName(e.title);
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        chosen === e.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className="block text-sm font-medium text-foreground">{e.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{e.description}</span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <form
          className="mt-4 space-y-3 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!example || !name.trim()) return;
            create.mutate({ example: example.id, name: name.trim() }, { onSuccess: onCreated });
          }}
        >
          <label className="block text-xs font-medium text-muted-foreground">
            Job name
            <Input className="mt-1" value={name} disabled={!example} onChange={(e) => setName(e.target.value)} placeholder="Choose an example first" />
          </label>
          {create.isError && (
            <p className="text-xs text-destructive">{create.error instanceof ResearcherApiError ? create.error.reason : create.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!example || !name.trim() || create.isPending}>
              {create.isPending ? "Creating..." : "Create job"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
