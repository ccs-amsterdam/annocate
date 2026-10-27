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
      "Markdown template for the unit. Insert values with `$unit.<field>`, `$var.<q>.label` " +
        "or `{{ js }}` (evaluated in the QuickJS sandbox over $unit and $var), and snippets with `[[name]]`; values optionally followed " +
        "by `::text` (default: literal text), `::markdown`, `::image` or `::html` (shown in a sandbox). Blocks: `::: if`, `::: from`, " +
        "`::: style`, `::: text|markdown|html|image [name]`, closed with `:::`. A field a span question selects in is shown as " +
        "plain `$unit.<field>` or a named `::: text` block. `\\$` is a literal `$` (docs/client.md §3).",
    ),
  /**
   * Named pieces of the template (docs/client.md §3, "Snippets"), put in
   * with `[[name]]` as if typed there (snippets.ts).
   */
  snippets: z
    .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "A snippet name is letters, digits and _"), z.string())
    .optional()
    .describe("Named pieces of the template, put in with [[name]] as if typed there (anywhere: lines, block fences, scripts)"),
  style: z.record(z.string(), z.string()).optional().describe("Optional inline CSS for the layout's root container"),
  colorScheme: z
    .enum(["light", "dark"])
    .optional()
    .describe("Always show the unit in light or dark colours (e.g. for styled content). Default: follow the coder's setting."),
  /** A non-rendered "meta" field, e.g. a source link shown alongside the unit but not part of the template. */
  meta: z.array(UnitLayoutMetaFieldSchema).optional(),
});
export type UnitLayout = z.infer<typeof UnitLayoutSchema>;
