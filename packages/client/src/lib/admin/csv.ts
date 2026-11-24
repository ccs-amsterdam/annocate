import {
  inferFieldType,
  isAnswerColumn,
  parseFieldValue,
  toUnitFieldName,
  unitFieldNameError,
  type UnitCreate,
  type UnitData,
  type UnitField,
  type UnitFieldType,
} from "@annotinder/contracts";

/**
 * The CSV parser of the units upload (docs/client.md §7): quoted cells (with
 * separators, newlines and `""` in them), commas or semicolons, a byte order
 * mark. The first line is the header; empty lines are left out.
 */
export function parseCsv(text: string): ParsedCsv {
  const content = text.startsWith("﻿") ? text.slice(1) : text;
  const separator = separatorOf(content);
  const { lines, unclosedQuoteLine } = splitCells(content, separator);
  const [headers = [], ...rows] = lines.filter((r) => !(r.length === 1 && r[0] === ""));

  const hints: string[] = [];
  if (separator === ";") hints.push("Read as separated by semicolons (;): the first line has no commas.");
  if (unclosedQuoteLine !== null)
    hints.push(
      `The quote (") that opens a cell on line ${unclosedQuoteLine} is never closed: everything after it was read as one cell. A quote inside a quoted cell is written twice ("").`,
    );
  const ragged = rows.filter((r) => r.length !== headers.length).length;
  if (ragged > 0)
    hints.push(
      `${ragged} row${ragged === 1 ? " has" : "s have"} more or fewer cells than the first line (${headers.length}): missing cells are empty, extra cells are left out.`,
    );
  return { headers, rows, separator, hints };
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  separator: Separator;
  /** What the researcher should know about how the file was read: a semicolon file, a stray quote, ragged rows. */
  hints: string[];
}

type Separator = "," | ";";

/** Semicolons (what a spreadsheet writes in many countries) when the first line has them and no comma. */
function separatorOf(content: string): Separator {
  const end = content.indexOf("\n");
  const firstLine = end < 0 ? content : content.slice(0, end);
  return firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
}

/**
 * The cells per line. A quote opens a quoted cell only at the cell's start
 * (elsewhere it is a character, as in `5" screen`); in a quoted cell `""` is a quote.
 */
function splitCells(content: string, separator: Separator): { lines: string[][]; unclosedQuoteLine: number | null } {
  const lines: string[][] = [];
  let line: string[] = [];
  let cell = "";
  let lineNumber = 1;
  // The line a quoted cell opened on, while inside it
  let quoteOpenedOn: number | null = null;
  // A cell that was quoted and closed: what follows (until the separator) is kept as it is
  let closed = false;

  const endCell = () => {
    line.push(cell);
    cell = "";
    closed = false;
  };
  const endLine = () => {
    endCell();
    lines.push(line);
    line = [];
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "\n") lineNumber++;
    if (quoteOpenedOn !== null) {
      if (char !== '"') cell += char;
      else if (content[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoteOpenedOn = null;
        closed = true;
      }
    } else if (char === '"' && cell === "" && !closed) quoteOpenedOn = lineNumber;
    else if (char === separator) endCell();
    else if (char === "\n") endLine();
    else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || line.length > 0) endLine();
  return { lines, unclosedQuoteLine: quoteOpenedOn };
}

/**
 * How a CSV column is uploaded: as the field `field` (empty: not uploaded)
 * of type `type`. A field the study already has keeps its type.
 */
export interface ColumnMapping {
  /** The column's index in the CSV. */
  column: number;
  field: string;
  type: UnitFieldType;
}

/** The type of each column, from its values (`inferFieldType`). */
export function columnTypes(headers: string[], rows: string[][]): UnitFieldType[] {
  // Answer columns are text (cells like `3..5` or `a|b`)
  return headers.map((h, i) => (isAnswerColumn(h.trim()) ? "text" : inferFieldType(rows.map((r) => r[i] ?? ""))));
}

/**
 * The starting mapping: a column whose name (or its valid form,
 * `toUnitFieldName`) is a field of the study is linked to it; the others are
 * not uploaded until given a name.
 */
export function initialMapping(headers: string[], rows: string[][], studyFields: UnitField[]): ColumnMapping[] {
  const types = columnTypes(headers, rows);
  return headers.map((header, column) => {
    const field = studyFields.find((f) => f.name === header || f.name === toUnitFieldName(header));
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
  studyFields: UnitField[],
  idColumn = -1,
): ColumnMapping[] {
  const types = columnTypes(headers, rows);
  const taken = new Set(mapping.map((m) => m.field).filter(Boolean));
  return mapping.map((m) => {
    if (m.field || m.column === idColumn) return m;
    const existing = studyFields.find((f) => f.name === toUnitFieldName(headers[m.column]) && !taken.has(f.name));
    const field = existing
      ? existing.name
      : toUnitFieldName(headers[m.column], new Set([...taken, ...studyFields.map((f) => f.name)]));
    taken.add(field);
    return { ...m, field, type: existing ? existing.type : types[m.column] };
  });
}

/** The values of a column that don't fit a type: how many, and a few examples. */
function badValues(rows: string[][], column: number, type: UnitFieldType): { count: number; examples: string[] } {
  const bad = rows.map((r) => r[column] ?? "").filter((v) => parseFieldValue(v, type) === undefined);
  return { count: bad.length, examples: [...new Set(bad)].slice(0, 3) };
}

/** What is wrong with each column's mapping (null: nothing): its name, a duplicate, or values that don't fit the type. */
export function mappingProblems(
  rows: string[][],
  mapping: ColumnMapping[],
  studyFields: UnitField[],
): (string | null)[] {
  return mapping.map((m) => {
    if (!m.field) return null;
    const existing = studyFields.find((f) => f.name === m.field);
    if (!existing) {
      const nameError = unitFieldNameError(m.field);
      if (nameError) return `Field name: ${nameError}`;
    }
    if (mapping.some((other) => other !== m && other.field === m.field))
      return `Two columns are uploaded as ${m.field}`;
    const type = existing?.type ?? m.type;
    const { count, examples } = badValues(rows, m.column, type);
    if (count > 0)
      return `${count} value${count === 1 ? " isn't a" : "s aren't"} ${type === "text" ? "text" : `${type}${count === 1 ? "" : "s"}`} (${examples.map((e) => `'${e}'`).join(", ")})`;
    return null;
  });
}

export interface CsvUnits {
  /** The fields the units will have: the study's, plus the new ones. */
  fields: UnitField[];
  units: UnitCreate[];
  /** Problems that block the upload. */
  errors: string[];
}

/**
 * Converts parsed CSV rows to typed units (contracts unitFields.ts) by the
 * mapping: each uploaded column becomes a field, parsed as its type (a
 * study's field keeps its type). Fields of the study that no column is uploaded
 * as are empty (null). Empty number/boolean cells become null.
 */
export function csvToUnits(
  headers: string[],
  rows: string[][],
  idColumn: number,
  mapping: ColumnMapping[],
  studyFields: UnitField[] = [],
): CsvUnits {
  const uploaded = mapping.filter((m) => m.field);
  const errors = mappingProblems(rows, mapping, studyFields)
    .map((problem, i) => problem && `${headers[mapping[i].column]}: ${problem}`)
    .filter((e): e is string => e !== null);
  if (uploaded.length === 0) errors.push("Choose at least one column to upload");
  const typeOf = (m: ColumnMapping) => studyFields.find((f) => f.name === m.field)?.type ?? m.type;
  const added = uploaded
    .filter((m) => !studyFields.some((f) => f.name === m.field))
    .map((m) => ({ name: m.field, type: m.type }));
  const fields = [...studyFields, ...added];

  const units = rows.map((row) => {
    const data: UnitData = Object.fromEntries(studyFields.map((f) => [f.name, null]));
    for (const m of uploaded) data[m.field] = parseFieldValue(row[m.column] ?? "", typeOf(m)) ?? null;
    return { externalId: (row[idColumn] ?? "").trim(), data };
  });
  if (units.some((u) => u.externalId === "")) errors.push(`Some rows have no ${headers[idColumn]}`);
  const ids = new Set<string>();
  const duplicate = units.find((u) => (ids.has(u.externalId) ? true : (ids.add(u.externalId), false)));
  if (duplicate) errors.push(`The id '${duplicate.externalId}' occurs more than once in ${headers[idColumn]}`);
  return { fields, units, errors };
}
