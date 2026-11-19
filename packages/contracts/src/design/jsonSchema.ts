import { z } from "zod";
import { TopLevelItemSchema } from "./item.js";
import { PublicInfoSchema, SessionSpecSchema } from "./session.js";

// JSON Schemas of designs and their items, for editors that check JSON as it
// is typed (the design editor's JSON views: completion, hover texts from the
// schemas' descriptions, and unknown or missing fields). Validation
// (validation.ts) remains what decides; references, names and nesting are
// checked there, not here.

type JsonSchema = Record<string, unknown>;

let cached: { item: JsonSchema; design: JsonSchema } | null = null;

function build() {
  // Output shape: unknown fields are flagged (`additionalProperties: false`)
  const items = z.toJSONSchema(z.array(TopLevelItemSchema), {
    io: "output",
    unrepresentable: "any",
    cycles: "ref",
    reused: "ref",
  }) as JsonSchema;
  // One item without its children (they are edited as items of their own)
  const item = JSON.parse(
    JSON.stringify({ ...items, type: undefined, items: undefined, $ref: (items.items as JsonSchema).$ref }),
  ) as JsonSchema;
  dropChildren(item);
  // The design as the editor's JSON view shows it: its public info, session and items
  const design = z.toJSONSchema(
    z
      .object({
        public: PublicInfoSchema.nullable().optional(),
        session: SessionSpecSchema.optional(),
        items: z.array(TopLevelItemSchema),
      })
      .strict(),
    { io: "output", unrepresentable: "any", cycles: "ref", reused: "ref" },
  ) as JsonSchema;
  cached = { item, design };
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

/** The JSON Schema of a design as the editor's JSON view shows it: `{ public, session, items }`. */
export function designJsonSchema(): JsonSchema {
  return (cached ?? build()).design;
}

/** The JSON Schema of one item without its `children`, as the item editor shows it. */
export function designItemJsonSchema(): JsonSchema {
  return (cached ?? build()).item;
}
