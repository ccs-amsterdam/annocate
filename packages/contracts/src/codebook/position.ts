import { z } from "zod";

/**
 * Dotted-decimal position string encoding a codebook item's place in the
 * (implicit) tree, e.g. "2", "4", "4.1", "4.2.1". Item "4.1" is a child of
 * item "4". See design plan §2.
 */
export const PositionSchema = z
  .string()
  .regex(/^[1-9]\d*(\.[1-9]\d*)*$/, "Position must be dot-separated positive integers, e.g. '4' or '4.2.1'");

export type Position = z.infer<typeof PositionSchema>;

/** Parses a position string into its numeric segments, e.g. "4.2.1" -> [4, 2, 1]. */
export function parsePosition(position: string): number[] {
  return position.split(".").map((segment) => Number(segment));
}

/** The position of the parent item, or null if this is a root-level (depth 1) item. */
export function parentPosition(position: string): string | null {
  const segments = position.split(".");
  if (segments.length <= 1) return null;
  return segments.slice(0, -1).join(".");
}

/** Nesting depth of a position, e.g. "4.2.1" has depth 3. */
export function positionDepth(position: string): number {
  return position.split(".").length;
}

/** True if `childPosition` is a direct child of `parentPositionValue`. */
export function isDirectChild(childPosition: string, parentPositionValue: string): boolean {
  return parentPosition(childPosition) === parentPositionValue;
}

/** Ordering comparator for two position strings (numeric per-segment comparison). */
export function comparePositions(a: string, b: string): number {
  const segA = parsePosition(a);
  const segB = parsePosition(b);
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const valA = segA[i] ?? -1;
    const valB = segB[i] ?? -1;
    if (valA !== valB) return valA - valB;
  }
  return 0;
}
