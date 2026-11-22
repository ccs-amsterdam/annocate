import { useState } from "react";
import { strToU8, zipSync } from "fflate";
import { designFile, type TopLevelItem } from "@annotinder/contracts";
import { readRawExport } from "../../../admin/rawExport";
import { Download, FileArchive } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCodersQuery, useDeploymentQuery, useStudyQuery } from "../../../admin/queries";
import {
  annotationsTable,
  codersTable,
  deletedCodersTable,
  devicesTable,
  displayChangesTable,
  timingsTable,
  resetAnswersTable,
  toCsv,
  type Table,
  unitsTable,
  variablesTable,
} from "../../../admin/exportData";
import { Labels, nestedQuestions, numericCodeQuestions, questionOrder } from "../../../admin/exportAnswers";
import { readme } from "../../../admin/exportReadme";
import { downloadFile } from "../../../admin/download";
import { toXlsx } from "../../../admin/xlsx";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { HelpButton } from "../../../help/HelpButton";

/**
 * Downloading the study's data (docs/client.md §7, "Results"): one zip with
 * the annotations, coders, the unit versions coded and the design's
 * variables as CSV files, and a README, built in the browser from the
 * researcher API.
 */
export function DownloadView({ client }: { client: ResearcherApi }) {
  const coders = useCodersQuery(client);
  const study = useStudyQuery(client).data;
  const deployment = useDeploymentQuery(client).data;
  const [withLabels, setWithLabels] = useState(true);
  const [withReset, setWithReset] = useState(false);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finished = (coders.data ?? []).reduce((n, c) => n + Object.values(c.finished).reduce((a, b) => a + b, 0), 0);
  const name = study?.name ?? `study ${client.studyId}`;

  /** The study's raw export, from the server (written now, or reused if nothing changed). */
  async function rawExport() {
    setBusy("Preparing the export…");
    const { url } = await client.exportResults();
    setBusy("Downloading…");
    return readRawExport(await client.downloadExport(url));
  }

  async function download() {
    setError(null);
    try {
      const raw = await rawExport();
      setBusy("Making the tables…");
      const rows = withReset ? raw.answers : raw.answers.filter((a) => !a.retiredAt);
      const annotations = rows.filter((a) => !a.retiredAt);
      const coderList = raw.coders;
      const numberOf = (id: number) => raw.designVersions.find((v) => v.id === id)?.number ?? null;
      // The design versions answers were given under, and the live one
      const liveId = deployment?.designVersionId ?? null;
      const ids = new Set(rows.flatMap((a) => (a.designVersionId === null ? [] : [a.designVersionId])));
      if (liveId !== null) ids.add(liveId);
      const designVersions = new Map<number, TopLevelItem[]>();
      const designs: Record<string, Uint8Array> = {};
      for (const version of raw.designVersions) {
        if (!ids.has(version.id)) continue;
        designVersions.set(version.id, version.items as TopLevelItem[]);
        // With the client it ran on (its latest deployment)
        const ran = raw.deployments.find((d) => d.designVersionId === version.id && d.client)?.client;
        designs[`designs/v${version.number}.json`] = strToU8(
          JSON.stringify(
            designFile(version, {
              name,
              version: version.number,
              client: ran ?? { release: "unknown", commit: "unknown" },
              exportedAt: new Date(),
            }),
            null,
            2,
          ),
        );
      }

      const live = liveId === null ? undefined : designVersions.get(liveId);
      const order = questionOrder(live);
      const nested = nestedQuestions(live);
      const numeric = numericCodeQuestions(live);
      const labels = withLabels ? new Labels(designVersions, liveId) : undefined;
      const now = new Date();
      // The tables, as CSV files or as the sheets of one workbook
      const tables: [string, Table][] = [
        ["annotations", annotationsTable(annotations, coderList, order, labels, nested, numberOf, numeric)],
        ["coders", codersTable(coderList, order, labels, nested, numeric)],
        ["units", unitsTable(raw.units, annotations, raw.sets)],
        ["variables", variablesTable(designVersions, numberOf)],
        ["timings", timingsTable(annotations, coderList)],
        ["devices", devicesTable(raw.devices)],
        ["display_changes", displayChangesTable(coderList)],
        ["deleted_coders", deletedCodersTable(raw.deletions)],
        ...(withReset
          ? [["reset_answers", resetAnswersTable(rows, labels, numberOf, numeric)] as [string, Table]]
          : []),
      ];
      const data: Record<string, Uint8Array> =
        format === "xlsx"
          ? { "results.xlsx": toXlsx(tables.map(([sheet, table]) => ({ name: sheet, table }))) }
          : Object.fromEntries(tables.map(([file, table]) => [`${file}.csv`, strToU8(toCsv(table))]));
      const zip = zipSync({ "README.txt": strToU8(readme(name, now, withLabels, format)), ...data, ...designs });
      downloadFile(
        zip as BlobPart,
        `${name.replace(/[^\w-]+/g, "_")}_${now.toISOString().slice(0, 10)}.zip`,
        "application/zip",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** The raw export as is: the browser saves it from the link. */
  async function downloadRaw() {
    setError(null);
    setBusy("Preparing the export…");
    try {
      const { url } = await client.exportResults();
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
            <FileArchive className="h-4 w-4 text-primary" /> All data
            <InfoTip label="What's in the zip">
              <ul className="list-disc pl-4">
                <li>
                  <strong>annotations.csv</strong>: a row per unit and coder, with a column per question (a scale: per
                  item)
                </li>
                <li>
                  <strong>coders.csv</strong>: a row per coder: link, coder id, how their session ended, and their
                  answers outside unit loops
                </li>
                <li>
                  <strong>devices.csv</strong>: the devices coders used (phone, tablet or desktop, browser, operating
                  system)
                </li>
                <li>
                  <strong>timings.csv</strong>: how long coders took per question, as their browser measured it, with
                  the server&apos;s own measure
                </li>
                <li>
                  <strong>deleted_coders.csv</strong>: coders whose data was deleted; delete them from earlier downloads
                  too
                </li>
                <li>
                  <strong>units.csv</strong>: the units as coders saw them, a row per version (a unit replaced after it
                  was coded has several)
                </li>
                <li>
                  <strong>variables.csv</strong>: per design version, each question&apos;s options and labels
                </li>
                <li>
                  <strong>designs/v&lt;n&gt;.json</strong>: each design version as a whole, with the AnnoTinder version
                  it ran on
                </li>
                <li>
                  <strong>README.txt</strong>: what the columns mean
                </li>
              </ul>
              <p className="mt-2">
                As CSV files (UTF-8), or as one Excel workbook with a sheet per table. Scripts (R, Python) can get the
                same data from the API with an API key (account menu).
              </p>
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button disabled={busy !== null} onClick={() => void download()}>
              <Download className="mr-1 h-4 w-4" /> Download
            </Button>
            <fieldset className="flex items-center gap-3 text-sm" aria-label="File format">
              {(
                [
                  ["csv", "CSV", "Plain CSV files: for R, Python, SPSS"],
                  ["xlsx", "Excel (.xlsx)", "One workbook, a sheet per table: for spreadsheets"],
                ] as const
              ).map(([value, label, title]) => (
                <label key={value} className="flex items-center gap-1.5" title={title}>
                  <input type="radio" name="format" checked={format === value} onChange={() => setFormat(value)} />
                  {label}
                </label>
              ))}
            </fieldset>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
              Download settings
            </summary>
            <div className="mt-2 flex flex-col gap-2 pl-1">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withLabels} onChange={(e) => setWithLabels(e.target.checked)} />
                Add label columns (the label each coder saw)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withReset} onChange={(e) => setWithReset(e.target.checked)} />
                Include answers that were reset (reset_answers)
              </label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void downloadRaw()}>
                  Raw export
                </Button>
                <InfoTip label="About the raw export">
                  The data as the server keeps it, for scripts: a zip with a JSON-lines file per table (answers, units,
                  coders, design versions, ...) and manifest.json. R: <code>jsonlite::stream_in</code>; Python:{" "}
                  <code>pandas.read_json(..., lines=True)</code>. Labels and wide tables are up to you.
                </InfoTip>
              </div>
            </div>
          </details>
          {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </section>
    </div>
  );
}
