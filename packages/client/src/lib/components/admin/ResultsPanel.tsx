import { useState } from "react";
import type { AnnotationRow, TopLevelItem } from "@annotinder/contracts";
import { Download, Users, FileSpreadsheet } from "lucide-react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCodebookQuery, useCodersQuery, useDeploymentQuery, useJobQuery } from "../../admin/queries";
import { annotationsTable, codersTable, questionOrder, toCsv, type Table } from "../../admin/exportData";
import { Button } from "@/components/ui/button";

/** Saves a table as a CSV file. */
function download(table: Table, filename: string) {
  const url = URL.createObjectURL(new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/** Every live annotation row, page by page. */
async function allAnnotations(client: ResearcherApi, onProgress: (n: number) => void): Promise<AnnotationRow[]> {
  const rows: AnnotationRow[] = [];
  let after: number | undefined;
  for (;;) {
    const page = await client.listAnnotations({ after, limit: 10000 });
    rows.push(...page.annotations);
    onProgress(rows.length);
    if (page.next === null) return rows;
    after = page.next;
  }
}

/**
 * Downloading the job's data (docs/client.md §7, "Results"): the
 * annotations (a row per unit and coder) and the coders (a row per coder)
 * as CSV files, columns in the order of the live codebook.
 */
export function ResultsPanel({ client }: { client: ResearcherApi }) {
  const coders = useCodersQuery(client);
  const job = useJobQuery(client).data;
  const deployment = useDeploymentQuery(client).data;
  const codebook = useCodebookQuery(client, deployment?.codebookId ?? null).data;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const order = questionOrder(codebook?.items as TopLevelItem[] | undefined);
  const base = (job?.name ?? `job-${client.jobId}`).replace(/[^\w-]+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  const finished = (coders.data ?? []).reduce((n, c) => n + Object.values(c.finished).reduce((a, b) => a + b, 0), 0);

  async function run(what: "annotations" | "coders") {
    setError(null);
    setBusy("Loading…");
    try {
      const list = await coders.refetch().then((r) => r.data ?? []);
      if (what === "coders") download(codersTable(list, order), `${base}_coders_${date}.csv`);
      else {
        const rows = await allAnnotations(client, (n) => setBusy(`Loading answers: ${n}…`));
        download(annotationsTable(rows, list, order), `${base}_annotations_${date}.csv`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-lg font-medium">Download data</h2>
          <p className="text-sm text-muted-foreground">
            {coders.data ? `${coders.data.length} coders, ${finished} units coded.` : "Loading…"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DownloadCard
            icon={FileSpreadsheet}
            title="Annotations"
            description="A row per unit and coder: the unit id, the coder, when they answered, and a column per question (a scale: a column per item)."
            disabled={busy !== null}
            onClick={() => void run("annotations")}
          />
          <DownloadCard
            icon={Users}
            title="Coders"
            description="A row per coder: invitation, participant id, started, how their session ended, units finished, and their answers outside unit loops."
            disabled={busy !== null}
            onClick={() => void run("coders")}
          />
        </div>
        {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          CSV files (UTF-8). Answers are the stored values, not the labels shown to coders; several answers are separated
          by &quot;; &quot;, spans are written as &quot;label: text&quot;, and questions a condition skipped are empty.
          Join the two files on <code>coder_id</code>. Scripts (R, Python) can get the same data, and more detail, from the
          API with an API key (account menu).
        </p>
      </section>
    </div>
  );
}

function DownloadCard({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof Download;
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <p className="flex-1 text-xs text-muted-foreground">{description}</p>
      <Button variant="outline" className="self-start" disabled={disabled} onClick={onClick}>
        <Download className="mr-1 h-4 w-4" /> Download CSV
      </Button>
    </div>
  );
}
