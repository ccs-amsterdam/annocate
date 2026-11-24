import {
  isAnswerColumn,
  parseList,
  type UnitCreate,
  type UnitDataValue,
  type UnitField,
  type UnitResponse,
} from "@annotinder/contracts";

// The cells the "Right answers" dialog writes (units/AnswerKeyDialog.tsx):
// right answers (`answer_<q>`) and practice feedback (`feedback_<q>`) of the
// gold and practice units. Contracts answerKey.ts reads the cells.

/** The cells typed per unit (by id): column -> text. */
export type CellEdits = Record<number, Record<string, string>>;

/** A unit's value as the text of its cell. */
export const cellText = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** A unit's cell: as typed, else as the unit has it. */
export const cellOf = (unit: UnitResponse, column: string, edits: CellEdits) =>
  edits[unit.id]?.[column] ?? cellText(unit.data[column]);

/** The units with a cell typed that differs from what the unit has. */
export function changedUnits(units: UnitResponse[], edits: CellEdits): UnitResponse[] {
  return units.filter((u) => Object.entries(edits[u.id] ?? {}).some(([col, v]) => v !== cellText(u.data[col])));
}

/** A cell as the column's type: numbers and booleans where the field has that type; answer columns as text. */
function cellValue(text: string, field: UnitField | undefined): UnitDataValue | { error: string } {
  const t = text.trim();
  if (t === "") return null;
  if (field && isAnswerColumn(field.name)) return t;
  if (field?.type === "number") {
    const n = Number(t);
    return Number.isFinite(n) ? n : { error: `Column ${field.name} holds numbers: "${t}" can't go in it.` };
  }
  if (field?.type === "boolean") return t === "true";
  if (field?.type === "list") return parseList(t) ?? { error: `Column ${field.name} holds lists: "${t}" isn't one.` };
  return t;
}

/** The changed units with their typed cells, to upload. Throws (with a message for people) on a cell that doesn't fit its column. */
export function unitsWithEdits(units: UnitResponse[], edits: CellEdits, fields: UnitField[]): UnitCreate[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  return changedUnits(units, edits).map((u) => {
    const data = { ...u.data };
    for (const [col, text] of Object.entries(edits[u.id] ?? {})) {
      const value = cellValue(text, byName.get(col));
      if (value !== null && typeof value === "object" && "error" in value) throw new Error(value.error);
      data[col] = value;
    }
    return { externalId: u.externalId, data };
  });
}
