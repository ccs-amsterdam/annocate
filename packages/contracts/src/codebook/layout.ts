import { z } from "zod";

// A unit's layout (docs/client.md §3): a single markdown template, rendered
// with a real, XSS-safe-by-construction markdown library (no raw HTML, see
// UnitFields.tsx). Values are inserted with references and `{{ }}` (see
// references.ts); they are plain text unless a suffix says otherwise, so a
// value is never interpreted as markdown by accident. Attached to a
// `unit_loop` codebook item.
export const UnitLayoutMetaFieldSchema = z.object({
  name: z.string(),
  column: z.string(),
});

export const UnitLayoutSchema = z.object({
  template: z
    .string()
    .describe(
      "Markdown template for the unit. Insert values with `$unit.<field>`, `$const.<name>`, `$var.<q>.value` " +
        "or `{{ js }}` (evaluated in the QuickJS sandbox over $unit, $var and $const), each optionally followed " +
        "by `::text` (default: literal text), `::markdown`, `::image` or `::tokenize` (only on a bare " +
        "`$unit.x` / `$const.x`: selectable text for span questions). `\\$` is a literal `$` (docs/client.md §3).",
    ),
  /**
   * Named string constants (docs/client.md §3), versioned alongside the
   * codebook/layout rather than per-unit data -- e.g. per-experimental-
   * condition intro text. Referenced as `$const.<name>`. Only a bare
   * `$unit.x::tokenize` / `$const.x::tokenize` can be tokenized, so span
   * offsets always point into ONE stable, versioned string (a data column
   * or a constant, never a composed/rendered blob) and stay meaningful
   * without replaying a particular rendering.
   */
  constants: z.record(z.string(), z.string()).optional(),
  style: z.record(z.string(), z.string()).optional().describe("Optional inline CSS for the layout's root container"),
  /** A non-rendered "meta" field, e.g. a source link shown alongside the unit but not part of the template. */
  meta: z.array(UnitLayoutMetaFieldSchema).optional(),
});
export type UnitLayout = z.infer<typeof UnitLayoutSchema>;
