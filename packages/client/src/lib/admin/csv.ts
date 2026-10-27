import {
  inferFieldType,
  parseFieldValue,
  toUnitFieldName,
  unitFieldNameError,
  type UnitCreate,
  type UnitData,
  type UnitField,
  type UnitFieldType,
} from "@annotinder/contracts";

/**
 * Minimal dependency-free CSV parser (docs/client.md §7), used for the units
 * upload UI. Deliberately simple -- handles double-quote-escaped fields
 * (including embedded commas/newlines/`""`), but no exotic dialects. Ported
 * conceptually from the old app's `react-papaparse` usage, without adding
 * that dependency (docs/client.md §8: keep dependencies minimal).
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      endField();
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      endRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();

  const [headers, ...dataRows] = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  return { headers: headers ?? [], rows: dataRows };
}

/**
 * How a CSV column is uploaded: as the field `field` (empty: not uploaded)
 * of type `type`. A field the job already has keeps its type.
 */
export interface ColumnMapping {
  /** The column's index in the CSV. */
  column: number;
  field: string;
  type: UnitFieldType;
}

/** The type of each column, from its values (`inferFieldType`). */
export function columnTypes(headers: string[], rows: string[][]): UnitFieldType[] {
  return headers.map((_, i) => inferFieldType(rows.map((r) => r[i] ?? "")));
}

/**
 * The starting mapping: a column whose name (or its valid form,
 * `toUnitFieldName`) is a field of the job is linked to it; the others are
 * not uploaded until given a name.
 */
export function initialMapping(headers: string[], rows: string[][], jobFields: UnitField[]): ColumnMapping[] {
  const types = columnTypes(headers, rows);
  return headers.map((header, column) => {
    const field = jobFields.find((f) => f.name === header || f.name === toUnitFieldName(header));
    return field ? { column, field: field.name, type: field.type } : { column, field: "", type: types[column] };
  });
}

/**
 * Every column not uploaded yet (except the id column) gets its own name,
 * made valid and unique, and its inferred (or the existing field's) type.
 */
export function assignAllColumns(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping[],
  jobFields: UnitField[],
  idColumn = -1,
): ColumnMapping[] {
  const types = columnTypes(headers, rows);
  const taken = new Set(mapping.map((m) => m.field).filter(Boolean));
  return mapping.map((m) => {
    if (m.field || m.column === idColumn) return m;
    const existing = jobFields.find((f) => f.name === toUnitFieldName(headers[m.column]) && !taken.has(f.name));
    const field = existing ? existing.name : toUnitFieldName(headers[m.column], new Set([...taken, ...jobFields.map((f) => f.name)]));
    taken.add(field);
    return { ...m, field, type: existing ? existing.type : types[m.column] };
  });
}

/** The values of a column that don't fit a type: how many, and a few examples. */
export function badValues(rows: string[][], column: number, type: UnitFieldType): { count: number; examples: string[] } {
  const bad = rows.map((r) => r[column] ?? "").filter((v) => parseFieldValue(v, type) === undefined);
  return { count: bad.length, examples: [...new Set(bad)].slice(0, 3) };
}

/** What is wrong with each column's mapping (null: nothing): its name, a duplicate, or values that don't fit the type. */
export function mappingProblems(rows: string[][], mapping: ColumnMapping[], jobFields: UnitField[]): (string | null)[] {
  return mapping.map((m) => {
    if (!m.field) return null;
    const existing = jobFields.find((f) => f.name === m.field);
    if (!existing) {
      const nameError = unitFieldNameError(m.field);
      if (nameError) return `Field name: ${nameError}`;
    }
    if (mapping.some((other) => other !== m && other.field === m.field)) return `Two columns are uploaded as ${m.field}`;
    const type = existing?.type ?? m.type;
    const { count, examples } = badValues(rows, m.column, type);
    if (count > 0) return `${count} value${count === 1 ? " isn't a" : "s aren't"} ${type === "text" ? "text" : `${type}${count === 1 ? "" : "s"}`} (${examples.map((e) => `'${e}'`).join(", ")})`;
    return null;
  });
}

export interface CsvUnits {
  /** The fields the units will have: the job's, plus the new ones. */
  fields: UnitField[];
  units: UnitCreate[];
  /** Problems that block the upload. */
  errors: string[];
}

/**
 * Converts parsed CSV rows to typed units (contracts unitFields.ts) by the
 * mapping: each uploaded column becomes a field, parsed as its type (a
 * job's field keeps its type). Fields of the job that no column is uploaded
 * as are empty (null). Empty number/boolean cells become null.
 */
export function csvToUnits(
  headers: string[],
  rows: string[][],
  idColumn: number,
  mapping: ColumnMapping[],
  jobFields: UnitField[] = [],
): CsvUnits {
  const uploaded = mapping.filter((m) => m.field);
  const errors = mappingProblems(rows, mapping, jobFields)
    .map((problem, i) => problem && `${headers[mapping[i].column]}: ${problem}`)
    .filter((e): e is string => e !== null);
  if (uploaded.length === 0) errors.push("Choose at least one column to upload");
  const typeOf = (m: ColumnMapping) => jobFields.find((f) => f.name === m.field)?.type ?? m.type;
  const added = uploaded.filter((m) => !jobFields.some((f) => f.name === m.field)).map((m) => ({ name: m.field, type: m.type }));
  const fields = [...jobFields, ...added];

  const units = rows.map((row) => {
    const data: UnitData = Object.fromEntries(jobFields.map((f) => [f.name, null]));
    for (const m of uploaded) data[m.field] = parseFieldValue(row[m.column] ?? "", typeOf(m)) ?? null;
    return { externalId: (row[idColumn] ?? "").trim(), data };
  });
  if (units.some((u) => u.externalId === "")) errors.push(`Some rows have no ${headers[idColumn]}`);
  const ids = new Set<string>();
  const duplicate = units.find((u) => (ids.has(u.externalId) ? true : (ids.add(u.externalId), false)));
  if (duplicate) errors.push(`The id '${duplicate.externalId}' occurs more than once in ${headers[idColumn]}`);
  return { fields, units, errors };
}
