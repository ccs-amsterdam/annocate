import { formatSetCell, type SetGroupResponse, type UnitData } from "@annotinder/contracts";

// The Units page's table and dialogs: what they show and keep, apart from React.

/** A unit's field as text: a list as its labels, nothing as "". */
export function unitFieldText(value: UnitData[string] | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : item.label)).join("; ");
  return String(value);
}

/** The page to show: the asked one, or the last page there is (after deleting the units of the last page). */
export function clampOffset(offset: number, total: number, pageSize: number): number {
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1) * pageSize;
  return Math.min(Math.max(0, offset), lastPage);
}

/** The selected units that still exist (a deleted unit is no longer selected). */
export function existingSelection(selected: ReadonlySet<number>, unitIds: Iterable<number>): Set<number> {
  const existing = new Set(unitIds);
  return new Set([...selected].filter((id) => existing.has(id)));
}

/**
 * The "to code" number as typed, when the field is left: a whole number from
 * 0 to `most`; null when it isn't a number (an empty field: nothing changes).
 */
export function parseToCode(text: string, most: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  return Math.min(Number(text.trim()), most);
}

/** Per role column, each unit's cell as in a CSV (its sets in the column, with its position in an ordered set). */
export function roleCells(groups: SetGroupResponse[]): Map<string, Map<number, string>> {
  const cells = new Map<string, Map<number, string>>();
  for (const group of groups) {
    const entries = new Map<number, { set: string; position?: number }[]>();
    for (const set of group.sets) {
      set.unitIds.forEach((id, i) =>
        entries.set(id, [
          ...(entries.get(id) ?? []),
          set.ordered ? { set: set.name, position: i + 1 } : { set: set.name },
        ]),
      );
    }
    cells.set(group.name, new Map([...entries].map(([id, e]) => [id, formatSetCell(e)])));
  }
  return cells;
}
