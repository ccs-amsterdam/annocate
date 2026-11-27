import { useState } from "react";
import type { ExampleSummary, StudyResponse } from "@annotinder/contracts";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResearcherApiError, type ResearcherApi } from "../../api/httpResearcherApi";
import { useCreateStudyFromExampleMutation, useExamplesQuery } from "../../admin/queries";

/**
 * "New study from an example" (docs/examples.md): the examples by
 * category, one line each (the chosen one shows its description); the
 * chosen one becomes an ordinary study, deployed, with a
 * link and sometimes example answers.
 */
export function ExamplesDialog({
  client,
  onCreated,
  onClose,
}: {
  client: ResearcherApi;
  onCreated: (study: StudyResponse) => void;
  onClose: () => void;
}) {
  const examplesQuery = useExamplesQuery(client);
  const create = useCreateStudyFromExampleMutation(client);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const examples = examplesQuery.data ?? [];
  const categories = [...new Set(examples.map((e) => e.category))];
  const example = examples.find((e) => e.id === chosen);

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="examples-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <h2 id="examples-title" className="text-lg font-semibold text-foreground">
          New study from an example
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An example makes a ready study: units, a deployed design and a link, sometimes with example answers. It is
          yours to try, change and delete.
        </p>
        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {examplesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading examples...</p>}
          {categories.map((category) => (
            <section key={category}>
              <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{category}</h3>
              <div className="grid gap-1">
                {examples
                  .filter((e) => e.category === category)
                  .map((e) => (
                    <ExampleRow
                      key={e.id}
                      example={e}
                      chosen={chosen === e.id}
                      onChoose={() => {
                        setChosen(e.id);
                        setName(e.title);
                      }}
                    />
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
            Study name
            <Input
              className="mt-1"
              value={name}
              disabled={!example}
              onChange={(e) => setName(e.target.value)}
              placeholder="Choose an example first"
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
            <Button type="submit" disabled={!example || !name.trim() || create.isPending}>
              {create.isPending ? "Creating..." : "Create study"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** An example on one line; chosen, it also shows what it is. */
function ExampleRow({ example, chosen, onChoose }: { example: ExampleSummary; chosen: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-expanded={chosen}
      onClick={onChoose}
      className={`rounded-md border px-3 py-1.5 text-left transition-colors ${
        chosen ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50"
      }`}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${chosen ? "rotate-90" : ""}`}
        />
        {example.title}
      </span>
      {chosen && <span className="mt-1 block pl-5 text-xs text-muted-foreground">{example.description}</span>}
    </button>
  );
}
