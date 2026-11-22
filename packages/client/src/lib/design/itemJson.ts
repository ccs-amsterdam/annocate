import type { DesignItem } from "@annotinder/contracts";
import { formatJson } from "./jsonFormat";
import { itemShapeError } from "./itemShape";

/** The item as JSON: without the editor's `_key`, and without children (they are items of their own). */
export function itemToJson(item: DesignItem): string {
  const own: Record<string, unknown> = { ...item };
  delete own._key;
  delete own.children;
  return formatJson(own);
}

/**
 * The item for edited JSON, keeping the editor's key and (for loops and
 * conditions) the children; or why it can't be applied. Only the shape the
 * editor needs is checked here; validation shows the rest.
 */
export function itemFromJson(text: string, current: DesignItem): { item: DesignItem } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid JSON" };
  }
  const error = itemShapeError(parsed, { children: false });
  if (error) return { error };
  const next: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  const type = next.type;
  const children = (current as { children?: unknown }).children;
  if (type === "unit_loop" || type === "questions") next.children = Array.isArray(children) ? children : [];
  const key = (current as { _key?: string })._key;
  if (key) next._key = key;
  return { item: next as unknown as DesignItem };
}
