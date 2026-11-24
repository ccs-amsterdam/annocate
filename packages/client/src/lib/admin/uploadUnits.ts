import {
  addToSets,
  isRoleColumn,
  parseSetCell,
  roleColumnProblem,
  setsFromCells,
  type RoleColumn,
  type SetGroupResponse,
  type SetGroupWrite,
  type UnitCreate,
  type UnitField,
} from "@annotinder/contracts";
import { csvToUnits, type ColumnMapping, type CsvUnits } from "./csv";

/** A CSV file as read: its name, cells, and how it was read where that needs saying (`parseCsv`). */
export interface CsvFile {
  name: string;
  headers: string[];
  rows: string[][];
  hints: string[];
}

/**
 * What the headers say: the column with the units' ids (named id,
 * externalid or external_id; else the first), and the columns named like a
 * role column, which are that column.
 */
export function detectColumns(headers: string[]): { idColumn: number; roles: Record<number, RoleColumn> } {
  const named = headers.findIndex((h) => /^(id|externalid|external_id)$/i.test(h.trim()));
  const idColumn = Math.max(0, named);
  const roles: Record<number, RoleColumn> = {};
  headers.forEach((header, column) => {
    const name = header.trim();
    if (column !== idColumn && isRoleColumn(name)) roles[column] = name;
  });
  return { idColumn, roles };
}

/**
 * What a CSV makes with its columns uploaded so: the units, the role
 * columns, and the errors that block the upload. `idColumn` -1: none chosen.
 */
export function csvUpload(
  csv: CsvFile,
  idColumn: number,
  mapping: ColumnMapping[],
  roles: Record<number, RoleColumn>,
  studyFields: UnitField[],
): CsvUpload {
  if (idColumn < 0)
    return {
      fields: [],
      units: [],
      errors: ["Choose the column with each unit's id: set its type to Unit id"],
      setGroups: [],
    };
  const units = csvToUnits(csv.headers, csv.rows, idColumn, mapping, studyFields);
  const errors = [...units.errors];
  const setGroups = Object.entries(roles).map(([column, group]) => {
    const cells = csv.rows.map((r) => ({ externalId: (r[idColumn] ?? "").trim(), cell: r[Number(column)] ?? "" }));
    const problem = roleCellsProblem(group, cells);
    if (problem) errors.push(`Column ${csv.headers[Number(column)]}: ${problem}`);
    return { group, cells };
  });
  const groups = setGroups.map((g) => g.group);
  const twice = groups.find((g, i) => groups.indexOf(g) !== i);
  if (twice) errors.push(`Two columns are uploaded as ${twice}`);
  return { ...units, errors, setGroups };
}

/**
 * What is wrong with a role column's cells: one that can't be read, or sets
 * the role doesn't allow (test_set: only overlap, practice or gold, one per unit).
 */
function roleCellsProblem(group: RoleColumn, cells: { cell: string }[]): string | null {
  const bad = cells.map((c) => parseSetCell(c.cell)).find((p) => "error" in p);
  if (bad && "error" in bad) return bad.error;
  const sets = setsFromCells(cells.map((c, i) => ({ unitId: i, cell: c.cell })));
  return "error" in sets ? sets.error : roleColumnProblem(group, sets);
}

/** The most units per `POST /units`. */
export const UPLOAD_BATCH = 200;

/** A column with a role in the file: which one, and per unit (by id) its cell. */
interface CsvSetGroup {
  group: RoleColumn;
  cells: { externalId: string; cell: string }[];
}

/** What a CSV makes: the units, and its columns with a role. */
export type CsvUpload = CsvUnits & { setGroups: CsvSetGroup[] };

/** How new units join a role column the file doesn't have. */
export type JoinMode = "distribute" | "new";

export interface UnitsUpload {
  units: UnitCreate[];
  overwrite: boolean;
  overwriteCoded: boolean;
  /** The file's role columns: each replaces what the column had. */
  setGroups: CsvSetGroup[];
  /** Role columns of the study the new units join, and how. */
  join: { group: SetGroupResponse; mode: JoinMode }[];
  /** The ids (in the file) of the units the study didn't have. */
  addedIds: string[];
  /** For shuffling the new units over sets. */
  seed: number;
}

/** The server calls an upload makes. */
export interface UploadApi {
  createUnits(body: { units: UnitCreate[]; overwrite: boolean; overwriteCoded: boolean }): Promise<unknown>;
  listUnits(): Promise<{ id: number; externalId: string }[]>;
  putSetGroup(group: string, body: SetGroupWrite): Promise<unknown>;
}

interface UploadOutcome {
  /** How many of the units were uploaded. */
  uploaded: number;
  /** Why it stopped before the end; null: everything was uploaded. */
  error: string | null;
}

/**
 * Uploads the units in batches, then the role columns. Stops at the first
 * failure and says how far it got: the batches before it stay uploaded.
 */
export async function uploadUnits(
  upload: UnitsUpload,
  api: UploadApi,
  onProgress: (uploaded: number) => void,
): Promise<UploadOutcome> {
  let uploaded = 0;
  try {
    for (; uploaded < upload.units.length; uploaded += UPLOAD_BATCH) {
      onProgress(uploaded);
      await api.createUnits({
        overwrite: upload.overwrite,
        overwriteCoded: upload.overwrite && upload.overwriteCoded,
        units: upload.units.slice(uploaded, uploaded + UPLOAD_BATCH),
      });
    }
    uploaded = upload.units.length;
    await uploadSets(upload, api);
    return { uploaded, error: null };
  } catch (e) {
    return { uploaded, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The new units into the chosen role columns, and the file's role columns. */
async function uploadSets(upload: UnitsUpload, api: UploadApi): Promise<void> {
  const joins = upload.addedIds.length > 0 ? upload.join : [];
  if (upload.setGroups.length === 0 && joins.length === 0) return;
  const ids = new Map((await api.listUnits()).map((u) => [u.externalId, u.id]));
  const newIds = upload.addedIds.flatMap((externalId) => ids.get(externalId) ?? []);
  for (const { group, mode } of joins) {
    await api.putSetGroup(group.name, { sets: addToSets(group.sets, newIds, mode, upload.seed) });
  }
  for (const { group, cells } of upload.setGroups) {
    const sets = setsFromCells(
      cells.flatMap((c) => (ids.has(c.externalId) ? [{ unitId: ids.get(c.externalId)!, cell: c.cell }] : [])),
    );
    if ("error" in sets) throw new Error(sets.error);
    await api.putSetGroup(group, { sets });
  }
}

/** What to tell the researcher after an upload that stopped half way. */
export function uploadFailureText(outcome: UploadOutcome, total: number): string {
  if (outcome.uploaded === total)
    return `The ${total} units were uploaded, but their sets were not saved: ${outcome.error}`;
  return `Uploaded ${outcome.uploaded} of ${total} units, then it stopped: ${outcome.error}`;
}

/**
 * Uploading a role column replaces it: units that are in the column now and
 * not in the file lose their value. Per role column in the file, how many.
 */
export function unitsLosingRole(
  setGroups: CsvSetGroup[],
  studyGroups: SetGroupResponse[],
  studyUnits: { id: number; externalId: string }[],
): { group: RoleColumn; count: number }[] {
  const externalIds = new Map(studyUnits.map((u) => [u.id, u.externalId]));
  return setGroups.flatMap(({ group, cells }) => {
    const inFile = new Set(cells.map((c) => c.externalId));
    const inColumn = new Set(studyGroups.find((g) => g.name === group)?.sets.flatMap((s) => s.unitIds) ?? []);
    const count = [...inColumn].filter((id) => !inFile.has(externalIds.get(id) ?? "")).length;
    return count > 0 ? [{ group, count }] : [];
  });
}
