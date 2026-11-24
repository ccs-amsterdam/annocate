import { z } from "zod";
import { HighlightSchema } from "./highlight.js";
import { styleProblems } from "./safeCss.js";
import { SafeNameSchema } from "../common.js";

/** The most snippets a layout has, and the longest a snippet is (snippets.ts: what they add up to in a template is bounded too). */
export const MAX_SNIPPETS = 50;
export const MAX_SNIPPET_LENGTH = 20_000;

// A unit's layout (docs/client.md §3): a single markdown template, rendered
// with a real, XSS-safe-by-construction markdown library (no raw HTML, see
// UnitFields.tsx). Values are inserted with references and `{{ }}` (see
// references.ts); they are plain text unless a suffix says otherwise, so a
// value is never interpreted as markdown by accident. Attached to a
// `unit_loop` design item.
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
    .record(SafeNameSchema, z.string().max(MAX_SNIPPET_LENGTH, "A snippet has at most 20,000 characters"))
    .refine((snippets) => Object.keys(snippets).length <= MAX_SNIPPETS, `A layout has at most ${MAX_SNIPPETS} snippets`)
    .optional()
    .describe(
      "Named pieces of the template, put in with [[name]] as if typed there (anywhere: lines, block fences, scripts)",
    ),
  highlight: z
    .array(HighlightSchema)
    .optional()
    .describe(
      'Words to mark in the unit, each query with a colour: climate energy (or), AND, "a phrase", "near words"~5, climat*',
    ),
  style: z
    .record(z.string(), z.string())
    .superRefine((style, ctx) => {
      for (const message of styleProblems(style)) ctx.addIssue({ code: "custom", message });
    })
    .optional()
    .describe("Optional inline CSS for the layout's root container (the properties safeCss.ts allows)"),
});
export type UnitLayout = z.infer<typeof UnitLayoutSchema>;
