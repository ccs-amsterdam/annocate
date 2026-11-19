import type { UnitChanges } from "@annotinder/contracts";

/** "3 added, 1 changed, sets changed": a unit change summary. */
export function describeUnitChanges(c: UnitChanges): string {
  const parts = [
    c.added > 0 && `${c.added} added`,
    c.changed > 0 && `${c.changed} changed`,
    c.removed > 0 && `${c.removed} removed`,
    c.sets && "sets changed",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}
