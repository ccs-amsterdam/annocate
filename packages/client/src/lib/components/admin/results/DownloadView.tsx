import { useState } from "react";
import { zipSync } from "fflate";
import { readRawExport } from "../../../admin/rawExport";
import { AlertTriangle, Download, FileArchive } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCodersQuery, useDeploymentQuery, useStudyQuery } from "../../../admin/queries";
import { CSV_FORMULA_ADVICE, CSV_FORMULA_WARNING } from "../../../admin/exportReadme";
import { downloadFile } from "../../../admin/download";
import { buildDownload, downloadName } from "../../../admin/buildDownload";
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
  const [format, setFormat] = useState<Format>("csv");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finished = (coders.data ?? []).reduce((n, c) => n + c.finished.reduce((sum, loop) => sum + loop.units, 0), 0);
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
      const now = new Date();
      const files = buildDownload(raw, {
        study: name,
        liveDesignVersionId: deployment?.designVersionId ?? null,
        withLabels,
        withReset,
        format,
        now,
      });
      downloadFile(zipSync(files) as BlobPart, downloadName(name, now), "application/zip");
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
            <ZipContents />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button disabled={busy !== null} onClick={() => void download()}>
              <Download className="mr-1 h-4 w-4" /> Download
            </Button>
            <FormatChoice format={format} onChange={setFormat} />
          </div>
          {format === "csv" && (
            <p role="note" className="flex gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {CSV_FORMULA_WARNING} {CSV_FORMULA_ADVICE}
              </span>
            </p>
          )}
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

/** What the zip holds, behind an info button. */
function ZipContents() {
  return (
    <InfoTip label="What's in the zip">
      <ul className="list-disc pl-4">
        <li>
          <strong>annotations.csv</strong>: a row per unit and coder, with a column per question (a scale: per item)
        </li>
        <li>
          <strong>coders.csv</strong>: a row per coder: link, coder id, how their session ended, and their answers
          outside unit loops
        </li>
        <li>
          <strong>devices.csv</strong>: the devices coders used (phone, tablet or desktop, browser, operating system)
        </li>
        <li>
          <strong>timings.csv</strong>: how long coders took per question, as their browser measured it, with the
          server&apos;s own measure
        </li>
        <li>
          <strong>display_changes.csv</strong>: how each coder&apos;s screen looked (keys for answers, width, theme), a
          row per change
        </li>
        <li>
          <strong>reset_answers.csv</strong>: answers that were reset, if you include them (Download settings)
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
          <strong>designs/v&lt;n&gt;.json</strong>: each design version as a whole, with the AnnoTinder version it ran
          on
        </li>
        <li>
          <strong>README.txt</strong>: what the columns mean
        </li>
      </ul>
      <p className="mt-2">
        As CSV files (UTF-8), or as one Excel workbook with a sheet per table. Scripts (R, Python) can get the same data
        from the API with an API key (account menu).
      </p>
    </InfoTip>
  );
}

type Format = "csv" | "xlsx";

/** CSV files or one Excel workbook. */
function FormatChoice({ format, onChange }: { format: Format; onChange: (format: Format) => void }) {
  return (
    <fieldset className="flex items-center gap-3 text-sm" aria-label="File format">
      {(
        [
          ["csv", "CSV", "Plain CSV files: for R, Python, SPSS. Not for opening in a spreadsheet"],
          ["xlsx", "Excel (.xlsx)", "One workbook, a sheet per table: safe to open in a spreadsheet"],
        ] as const
      ).map(([value, label, title]) => (
        <label key={value} className="flex items-center gap-1.5" title={title}>
          <input type="radio" name="format" checked={format === value} onChange={() => onChange(value)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
