import { strToU8 } from "fflate";
import { designFile, type TopLevelItem } from "@annotinder/contracts";
import {
  annotationsTable,
  coderListTable,
  codersTable,
  deletedCodersTable,
  devicesTable,
  displayChangesTable,
  resetAnswersTable,
  timingsTable,
  toCsv,
  unitsTable,
  variablesTable,
  type Table,
} from "./exportData";
import { Labels, nestedQuestions, numericCodeQuestions, questionOrder } from "./exportAnswers";
import { readme } from "./exportReadme";
import type { RawExport } from "./rawExport";
import { toXlsx } from "./xlsx";

// The data download (results/DownloadView.tsx): the files of its zip, built
// from the server's raw export. docs/client.md §7, "Results".

export interface DownloadOptions {
  /** The study's name: in the README and the design files. */
  study: string;
  /** The deployed design version: its labels where an answer's own version has none, and its question order. */
  liveDesignVersionId: number | null;
  /** Adds `.label` columns (the label each coder saw). */
  withLabels: boolean;
  /** Includes answers that were reset (`reset_answers`). */
  withReset: boolean;
  /** Plain CSV files, or one workbook with a sheet per table. */
  format: "csv" | "xlsx";
  /** When it is downloaded. */
  now: Date;
}

/** The files of the data download, by their name in the zip. */
export function buildDownload(raw: RawExport, options: DownloadOptions): Record<string, Uint8Array> {
  const { study, withLabels, format, now } = options;
  const used = usedDesignVersions(raw, options);
  const tables = downloadTables(raw, used, options);
  const data: Record<string, Uint8Array> =
    format === "xlsx"
      ? { "results.xlsx": toXlsx(tables.map(([sheet, table]) => ({ name: sheet, table }))) }
      : Object.fromEntries(tables.map(([file, table]) => [`${file}.csv`, strToU8(toCsv(table))]));
  return {
    "README.txt": strToU8(readme(study, now, withLabels, format)),
    ...data,
    ...designFiles(raw, used, study, now),
  };
}

/** The zip's name: the study's name (as a file name) and the day. */
export function downloadName(study: string, now: Date): string {
  return `${study.replace(/[^\w-]+/g, "_")}_${now.toISOString().slice(0, 10)}.zip`;
}

/** The answers the download holds: the live ones, and with `withReset` the reset ones too. */
const answersOf = (raw: RawExport, withReset: boolean) =>
  withReset ? raw.answers : raw.answers.filter((a) => !a.retiredAt);

/** The design versions answers were given under, and the live one. */
function usedDesignVersions(
  raw: RawExport,
  { liveDesignVersionId, withReset }: DownloadOptions,
): RawExport["designVersions"] {
  const ids = new Set(answersOf(raw, withReset).map((a) => a.designVersionId));
  if (liveDesignVersionId !== null) ids.add(liveDesignVersionId);
  return raw.designVersions.filter((version) => ids.has(version.id));
}

/** Each used design version as a design file (`designs/v<n>.json`), with the client it ran on (its latest deployment). */
function designFiles(
  raw: RawExport,
  used: RawExport["designVersions"],
  study: string,
  now: Date,
): Record<string, Uint8Array> {
  return Object.fromEntries(
    used.map((version) => {
      const ran = raw.deployments.find((d) => d.designVersionId === version.id && d.client)?.client;
      const file = designFile(version, {
        name: study,
        version: version.number,
        client: ran ?? { release: "unknown", commit: "unknown" },
        exportedAt: now,
      });
      return [`designs/v${version.number}.json`, strToU8(JSON.stringify(file, null, 2))];
    }),
  );
}

/** The tables, by name: CSV files or the sheets of one workbook. */
function downloadTables(
  raw: RawExport,
  used: RawExport["designVersions"],
  { liveDesignVersionId, withLabels, withReset }: DownloadOptions,
): [string, Table][] {
  const rows = answersOf(raw, withReset);
  const annotations = rows.filter((a) => !a.retiredAt);
  const numberOf = (id: number) => raw.designVersions.find((v) => v.id === id)?.number ?? null;
  const designVersions = new Map(used.map((version) => [version.id, version.items as TopLevelItem[]]));
  const live = liveDesignVersionId === null ? undefined : designVersions.get(liveDesignVersionId);
  const order = questionOrder(live);
  const nested = nestedQuestions(live);
  const numeric = numericCodeQuestions(live);
  const labels = withLabels ? new Labels(designVersions, liveDesignVersionId) : undefined;
  const tables: [string, Table][] = [
    ["annotations", annotationsTable(annotations, raw.sessions, order, labels, nested, numberOf, numeric)],
    ["sessions", codersTable(raw.sessions, order, labels, nested, numeric)],
    ["coders", coderListTable(raw.coders)],
    ["units", unitsTable(raw.units, annotations, raw.sets)],
    ["variables", variablesTable(designVersions, numberOf)],
    ["timings", timingsTable(annotations, raw.sessions)],
    ["devices", devicesTable(raw.devices)],
    ["display_changes", displayChangesTable(raw.sessions)],
    ["deleted_coders", deletedCodersTable(raw.deletions)],
  ];
  if (withReset) tables.push(["reset_answers", resetAnswersTable(rows, labels, numberOf, numeric)]);
  return tables;
}
