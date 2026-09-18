import { z } from "zod";

// Ported from old/src/app/api/.../codebookNodes/layoutSchemas.ts, then
// substantially redesigned (design plan §11c, resolved 2026-09-18):
// collapsed the old array-of-typed-fields (text/markdown/image) + CSS-grid
// arrangement system down to a SINGLE markdown template. Rationale: the old
// system grew fields -> grid -> markdown-with-injected-fields over time,
// each layer mostly subsuming the previous one's use cases; a single
// markdown template (rendered via a real, XSS-safe-by-construction markdown
// library -- no raw HTML, see UnitFields.tsx) covers layout/arrangement via
// ordinary markdown/CSS, images via a `::field[column]{as="image"}`
// directive, and per-element styling via directive attributes converted to
// React style objects. Attached to a `unit_loop` codebook item (§2).
export const UnitLayoutMetaFieldSchema = z.object({
  name: z.string(),
  column: z.string(),
});

export const UnitLayoutSchema = z.object({
  template: z
    .string()
    .describe(
      'Markdown template for the unit. Supports plain {{column}} substitution for simple text interpolation, ' +
        'and a `::field[column]` directive (leaf directive syntax) for "special" rendering of a unit data column: ' +
        '`::field[column]{as="image"}` renders it as an image; a bare `::field[column]` renders the column\'s text, ' +
        "made interactively selectable when the coder is currently answering a span variable targeting that column " +
        "(design plan §11b).",
    ),
  style: z.record(z.string(), z.string()).optional().describe("Optional inline CSS for the layout's root container"),
  /** A non-rendered "meta" field, e.g. a source link shown alongside the unit but not part of the template. */
  meta: z.array(UnitLayoutMetaFieldSchema).optional(),
});
export type UnitLayout = z.infer<typeof UnitLayoutSchema>;
