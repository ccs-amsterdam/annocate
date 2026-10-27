import { z } from "zod";
import { TopLevelItemSchema } from "./item.js";

// JSON Schemas of codebook items, for editors that check JSON as it is typed
// (the codebook editor's JSON views: completion, hover texts from the
// schemas' descriptions, and unknown or missing fields). Validation
// (validation.ts) remains what decides; references, names and nesting are
// checked there, not here.

type JsonSchema = Record<string, unknown>;

let cached: { items: JsonSchema; item: JsonSchema } | null = null;

function build() {
  // Output shape: unknown fields are flagged (`additionalProperties: false`)
  const items = z.toJSONSchema(z.array(TopLevelItemSchema), { io: "output", unrepresentable: "any", cycles: "ref", reused: "ref" }) as JsonSchema;
  // One item without its children (they are edited as items of their own)
  const item = JSON.parse(JSON.stringify({ ...items, type: undefined, items: undefined, $ref: (items.items as JsonSchema).$ref })) as JsonSchema;
  dropChildren(item);
  cached = { items, item };
  return cached;
}

function dropChildren(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach(dropChildren);
  const obj = node as JsonSchema;
  const properties = obj.properties as JsonSchema | undefined;
  if (properties && "children" in properties) {
    delete properties.children;
    if (Array.isArray(obj.required)) obj.required = obj.required.filter((r) => r !== "children");
  }
  Object.values(obj).forEach(dropChildren);
}

/** The JSON Schema of a codebook's items (a list of top-level items). */
export function codebookItemsJsonSchema(): JsonSchema {
  return (cached ?? build()).items;
}

/** The JSON Schema of one item without its `children`, as the item editor shows it. */
export function codebookItemJsonSchema(): JsonSchema {
  return (cached ?? build()).item;
}
