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

/** Converts parsed rows to `UnitCreate`-shaped records, given which header is the external id column. */
export function csvRowsToUnits(
  headers: string[],
  rows: string[][],
  idColumn: string,
): { externalId: string; data: Record<string, string | number | boolean> }[] {
  const idIndex = headers.indexOf(idColumn);
  return rows.map((row) => {
    const data: Record<string, string | number | boolean> = {};
    headers.forEach((header, i) => {
      if (i === idIndex) return;
      data[header] = row[i] ?? "";
    });
    return { externalId: row[idIndex] ?? "", data };
  });
}
