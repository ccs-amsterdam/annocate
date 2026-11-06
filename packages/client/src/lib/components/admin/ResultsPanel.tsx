import { useState } from "react";
import { strToU8, zipSync } from "fflate";
import { designFile, type AnnotationRow, type TopLevelItem, type UnitVersion } from "@annotinder/contracts";
import { describeVersions } from "../../design/versions";
import { Download, FileArchive } from "lucide-react";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import { useCodersQuery, useDeploymentQuery, useJobQuery } from "../../admin/queries";
import {
  Labels,
  annotationsTable,
  codersTable,
  deletedCodersTable,
  devicesTable,
  timingsTable,
  nestedQuestions,
  questionOrder,
  readme,
  resetAnswersTable,
  toCsv,
  unitsTable,
  variablesTable,
} from "../../admin/exportData";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../help/HelpButton";

/** Every row of a paged researcher API list. */
async function allPages<T>(
  fetchPage: (after: number | undefined) => Promise<{ rows: T[]; next: number | null }>,
  onProgress: (n: number) => void,
): Promise<T[]> {
  const rows: T[] = [];
  let after: number | undefined;
  for (;;) {
    const page = await fetchPage(after);
    rows.push(...page.rows);
    onProgress(rows.length);
    if (page.next === null) return rows;
    after = page.next;
  }
}

/** Saves bytes as a file. */
function save(bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Downloading the job's data (docs/client.md §7, "Results"): one zip with
 * the annotations, coders, the unit versions coded and the codebook's
 * variables as CSV files, and a README, built in the browser from the
 * researcher API.
 */
export function ResultsPanel({ client }: { client: ResearcherApi }) {
  const coders = useCodersQuery(client);
  const job = useJobQuery(client).data;
  const deployment = useDeploymentQuery(client).data;
  const [withLabels, setWithLabels] = useState(true);
  const [withReset, setWithReset] = useState(false);
  const [spreadsheetSafe, setSpreadsheetSafe] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finished = (coders.data ?? []).reduce((n, c) => n + Object.values(c.finished).reduce((a, b) => a + b, 0), 0);
  const name = job?.name ?? `job ${client.jobId}`;

  async function download() {
    setError(null);
    setBusy("Loading coders…");
    try {
      const coderList = (await coders.refetch()).data ?? [];
      const deletions = await client.listCoderDeletions();
      const devices = await client.listDevices();
      const rows = await allPages<AnnotationRow>(
        async (after) => {
          const page = await client.listAnnotations({ after, limit: 10000, ...(withReset ? { retired: "true" as const } : {}) });
          return { rows: page.annotations, next: page.next };
        },
        (n) => setBusy(`Loading answers: ${n}…`),
      );
      const versions = await allPages<UnitVersion>(
        async (after) => {
          const page = await client.listUnitVersions({ after, limit: 10000 });
          return { rows: page.versions, next: page.next };
        },
        (n) => setBusy(`Loading units: ${n}…`),
      );
      const annotations = rows.filter((a) => !a.retiredAt);
      // The design versions answers were given under, and the live one.
      setBusy("Loading design versions…");
      const ids = new Set(rows.flatMap((a) => (a.designVersionId === null ? [] : [a.designVersionId])));
      if (deployment) ids.add(deployment.designVersionId);
      const designVersions = new Map<number, TopLevelItem[]>();
      const designs: Record<string, Uint8Array> = {};
      // Per design version: design.json, with the client it ran on (its latest deployment)
      const numbers = describeVersions(await client.listDesignVersions(), deployment?.designVersionId ?? null);
      const deployments = await client.listDeploymentVersions();
      for (const id of ids) {
        const version = await client.getDesignVersion(id);
        designVersions.set(id, version.items as TopLevelItem[]);
        const ran = deployments.find((d) => d.designVersionId === id && d.client)?.client;
        const number = numbers.numberOf(id);
        designs[`designs/v${number ?? id}.json`] = strToU8(
          JSON.stringify(designFile(version, { name, version: number, client: ran ?? { release: "unknown", commit: "unknown" }, exportedAt: new Date() }), null, 2),
        );
      }

      const liveId = deployment?.designVersionId ?? null;
      const order = questionOrder(liveId === null ? undefined : designVersions.get(liveId));
      const nested = nestedQuestions(liveId === null ? undefined : designVersions.get(liveId));
      const labels = withLabels ? new Labels(designVersions, liveId) : undefined;
      const now = new Date();
      const zip = zipSync({
        "README.txt": strToU8(readme(name, now, withLabels, spreadsheetSafe)),
        "annotations.csv": strToU8(toCsv(annotationsTable(annotations, coderList, order, labels, nested, numbers.numberOf), spreadsheetSafe)),
        "coders.csv": strToU8(toCsv(codersTable(coderList, order, labels, nested), spreadsheetSafe)),
        "devices.csv": strToU8(toCsv(devicesTable(devices), spreadsheetSafe)),
        "timings.csv": strToU8(toCsv(timingsTable(annotations, coderList), spreadsheetSafe)),
        "deleted_coders.csv": strToU8(toCsv(deletedCodersTable(deletions), spreadsheetSafe)),
        "units.csv": strToU8(toCsv(unitsTable(versions, annotations, await client.listSetGroups()), spreadsheetSafe)),
        "variables.csv": strToU8(toCsv(variablesTable(designVersions, numbers.numberOf), spreadsheetSafe)),
        ...designs,
        ...(withReset ? { "reset_answers.csv": strToU8(toCsv(resetAnswersTable(rows, labels, numbers.numberOf), spreadsheetSafe)) } : {}),
      });
      save(zip, `${name.replace(/[^\w-]+/g, "_")}_${now.toISOString().slice(0, 10)}.zip`, "application/zip");
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
          <h2 className="flex items-center gap-1.5 text-lg font-medium">
            Download data <HelpButton topic="results" label="Help: results" />
          </h2>
          <p className="text-sm text-muted-foreground">
            {coders.data ? `${coders.data.length} coders, ${finished} units coded.` : "Loading…"}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 font-medium">
            <FileArchive className="h-4 w-4 text-primary" /> All data (zip)
            <InfoTip label="What's in the zip">
          <ul className="list-disc pl-4">
            <li>
              <strong>annotations.csv</strong>: a row per unit and coder, with a column per question (a scale: per item)
            </li>
            <li>
              <strong>coders.csv</strong>: a row per coder: link, participant id, how their session ended, and their
              answers outside unit loops
            </li>
            <li>
              <strong>devices.csv</strong>: the devices coders used (phone, tablet or desktop, browser, operating system)
            </li>
            <li>
              <strong>timings.csv</strong>: how long coders took per question, as their browser measured it, with the server&apos;s own measure
            </li>
            <li>
              <strong>deleted_coders.csv</strong>: coders whose data was deleted; delete them from earlier downloads too
            </li>
            <li>
              <strong>units.csv</strong>: the units as coders saw them, a row per version (a unit replaced after it was
              coded has several)
            </li>
            <li>
              <strong>variables.csv</strong>: per design version, each question&apos;s options and labels
            </li>
            <li>
              <strong>designs/v&lt;n&gt;.json</strong>: each design version as a whole, with the AnnoTinder version it ran on
            </li>
            <li>
              <strong>README.txt</strong>: what the columns mean
            </li>
          </ul>
          <p className="mt-2">CSV files (UTF-8). Scripts (R, Python) can get the same data from the API with an API key (account menu).</p>
            </InfoTip>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withLabels} onChange={(e) => setWithLabels(e.target.checked)} />
            Add label columns (the label each coder saw)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withReset} onChange={(e) => setWithReset(e.target.checked)} />
            Include answers that were reset (reset_answers.csv)
          </label>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={spreadsheetSafe} onChange={(e) => setSpreadsheetSafe(e.target.checked)} />
              Safe to open in a spreadsheet
            </label>
            <InfoTip label="About spreadsheet-safe files">
              Text starting with =, +, - or @ gets a leading &apos; so it can&apos;t run as a formula (README.txt says how to remove it in R or
              Python).
            </InfoTip>
          </div>
          <Button className="self-start" disabled={busy !== null} onClick={() => void download()}>
            <Download className="mr-1 h-4 w-4" /> Download zip
          </Button>
          {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </section>
    </div>
  );
}
