import { inferFieldType, parseFieldValue, type UnitCreate, type UnitData, type UnitField } from "@annotinder/contracts";

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

export interface CsvUnits {
  /** The fields the units will have: the job's, or inferred from the columns for a first upload. */
  fields: UnitField[];
  units: UnitCreate[];
  /** Problems that block the upload, e.g. a column that doesn't match the job's fields. */
  errors: string[];
}

/**
 * Converts parsed CSV rows to typed units (contracts unitFields.ts). Without
 * `jobFields` (the job has no units yet) the field types are inferred from
 * the columns; otherwise the columns must be the job's fields, and cells are
 * parsed as their types. Empty number/boolean cells become null.
 */
export function csvToUnits(headers: string[], rows: string[][], idColumn: string, jobFields: UnitField[] = []): CsvUnits {
  const idIndex = headers.indexOf(idColumn);
  const columns = headers.map((name, index) => ({ name, index })).filter((c) => c.index !== idIndex);
  const errors: string[] = [];

  let fields: UnitField[];
  if (jobFields.length === 0) {
    fields = columns.map((c) => ({ name: c.name, type: inferFieldType(rows.map((r) => r[c.index] ?? "")) }));
  } else {
    fields = jobFields;
    const names = new Set(columns.map((c) => c.name));
    const missing = jobFields.filter((f) => !names.has(f.name)).map((f) => f.name);
    const extra = columns.filter((c) => !jobFields.some((f) => f.name === c.name)).map((c) => c.name);
    if (missing.length) errors.push(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    if (extra.length) errors.push(`Column${extra.length > 1 ? "s" : ""} not in the job's fields: ${extra.join(", ")}`);
    if (errors.length) return { fields, units: [], errors };
  }

  const typeOf = new Map(fields.map((f) => [f.name, f.type]));
  const units = rows.map((row, r) => {
    const data: UnitData = {};
    for (const c of columns) {
      const raw = row[c.index] ?? "";
      const value = parseFieldValue(raw, typeOf.get(c.name)!);
      if (value === undefined) {
        if (errors.length < 5) errors.push(`Row ${r + 2}: '${raw}' in ${c.name} is not a ${typeOf.get(c.name)}`);
      } else data[c.name] = value;
    }
    return { externalId: row[idIndex] ?? "", data };
  });
  if (units.some((u) => u.externalId === "")) errors.push(`Some rows have no ${idColumn}`);
  return { fields, units, errors };
}
