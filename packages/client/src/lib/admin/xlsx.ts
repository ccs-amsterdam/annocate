import { strToU8, zipSync } from "fflate";
import type { Table } from "./exportData";

// A minimal .xlsx writer for the data download: an Office Open XML workbook
// is a zip of XML files, made here with fflate (already in the bundle) rather
// than a spreadsheet library. One sheet per table. Text cells are inline
// strings, which spreadsheet programs never run as formulas; plain numbers
// are number cells.

/** Excel's limits: characters per cell, sheet name length. */
const MAX_CELL = 32767;
const MAX_SHEET_NAME = 31;

/** Text as XML content: escaped, without the control characters XML can't hold. */
const xml = (text: string) =>
  text
    // eslint-disable-next-line no-control-regex -- removing exactly these
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A number written as a number: plain decimals, no leading zeros (an id like "007" stays text). */
const isNumber = (v: string) => /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(v) && v.length <= 15;

/** The column letters of a 0-based column index: A, B, ..., Z, AA, ... */
function column(i: number): string {
  let name = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function sheetXml(table: Table): string {
  const rows = [table.headers, ...table.rows].map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${column(c)}${r + 1}`;
      if (value === "") return "";
      if (r > 0 && isNumber(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      const text = value.length > MAX_CELL ? value.slice(0, MAX_CELL - 1) + "…" : value;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cells.join("")}</row>`;
  });
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows.join("")}</sheetData></worksheet>`
  );
}

/** Sheet names: as given, cut to Excel's length, without the characters it refuses, unique. */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = name.replace(/[\\/?*[\]:]/g, "_").slice(0, MAX_SHEET_NAME) || "Sheet";
    let unique = base;
    for (let n = 2; used.has(unique.toLowerCase()); n++) unique = `${base.slice(0, MAX_SHEET_NAME - 3)}_${n}`;
    used.add(unique.toLowerCase());
    return unique;
  });
}

/** A workbook with a sheet per table, as the bytes of an .xlsx file. */
export function toXlsx(sheets: { name: string; table: Table }[]): Uint8Array {
  const names = sheetNames(sheets.map((s) => s.name));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `</Relationships>`,
    ),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.table))));
  return zipSync(files);
}
