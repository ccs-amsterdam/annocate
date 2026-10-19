import type { TopLevelItem, UnitField } from "@annotinder/contracts";

const UNIT_REF = /\$unit\.([A-Za-z0-9_]+)/g;

export interface UnitFieldWarning {
  /** The item that refers to the field (the loop itself for its layout). */
  item: string;
  field: string;
  message: string;
}

/**
 * References to unit fields that don't exist: `$unit.x` anywhere in a unit
 * loop (layout template, conditions, question texts), and the `column` of
 * span/relation questions (which may also name a layout constant). Nothing
 * to check while the job has no units (`fields` empty).
 */
export function unknownUnitFields(items: TopLevelItem[], fields: UnitField[]): UnitFieldWarning[] {
  if (fields.length === 0) return [];
  const known = new Set(fields.map((f) => f.name));
  const warnings: UnitFieldWarning[] = [];
  const seen = new Set<string>();
  const warn = (item: string, field: string, message: string) => {
    const key = `${item}/${field}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({ item, field, message });
  };

  for (const loop of items) {
    if (loop.type !== "unit_loop") continue;
    const constants = new Set(Object.keys(loop.layout?.constants ?? {}));
    scan(loop, loop.name, (item, value, key) => {
      if (key === "column" && !known.has(value) && !constants.has(value)) {
        warn(item, value, `${item}: column '${value}' is not a unit field`);
      }
      for (const [, field] of value.matchAll(UNIT_REF)) {
        if (!known.has(field)) warn(item, field, `${item}: $unit.${field} is not a unit field`);
      }
    });
  }
  return warnings;
}

/** Calls `visit` for every string in `node`, with the name of the closest item around it and its key. */
function scan(node: unknown, item: string, visit: (item: string, value: string, key: string) => void, key = "") {
  if (typeof node === "string") return visit(item, node, key);
  if (Array.isArray(node)) return node.forEach((child) => scan(child, item, visit));
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    // A nested item (question, condition) names itself
    const owner = "type" in record && typeof record.name === "string" ? record.name : item;
    for (const [k, v] of Object.entries(record)) if (k !== "name" && k !== "type") scan(v, owner, visit, k);
  }
}
