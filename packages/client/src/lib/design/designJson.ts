import { designItems, splitDesignItems, type TopLevelItem } from "@annotinder/contracts";
import { formatJson } from "./jsonFormat";
import { designShapeError } from "./itemShape";

/**
 * The editor's items as the design shows them: `{ public, session, items }`.
 * (The editor holds the session and public info as its first item, the
 * Study entry: contracts `designItems`.)
 */
export function designToJson(items: TopLevelItem[]): string {
  const { items: rest, session, public: info } = splitDesignItems(items);
  return formatJson({ public: info, session, items: rest });
}

/**
 * The editor's items for an edited design's JSON (without editor keys:
 * itemShape.ts `carryKeys` gives them back), or why it can't be applied.
 * Only the shape the editor needs is checked here; validation shows the rest.
 */
export function designFromJson(text: string): { items: TopLevelItem[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid JSON" };
  }
  const error = designShapeError(parsed);
  if (error) return { error };
  return { items: designItems(parsed as Parameters<typeof designItems>[0]) as TopLevelItem[] };
}
