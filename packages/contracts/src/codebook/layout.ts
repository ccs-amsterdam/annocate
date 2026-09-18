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
      "Markdown template for the unit. Supports {{ expression }} (a JS expression, evaluated in the same " +
        "QuickJS sandbox as `condition` items -- design plan §11f -- against unit data columns, this layout's " +
        "`constants`, and known variable values; e.g. `{{is_experiment ? experiment_intro : control_intro}}`), " +
        'and a `::field[name]` / `::tokenize[name]` directive (leaf directive syntax) for "special" rendering ' +
        'of a unit data column OR one of this layout\'s `constants` (same lookup, one namespace): ' +
        '`::field[name]{as="image"}` renders it as an image, a bare `::field[name]` renders its literal text ' +
        "(optionally `{markdown=true}` to interpret it as nested markdown -- NOT combinable with `::tokenize`, " +
        "see below), and `::tokenize[name]` renders its literal text as interactively selectable for the " +
        "currently-active `span` variable targeting that name (design plan §11b/§11f).",
    ),
  /**
   * Named string constants (design plan §11f), versioned alongside the
   * codebook/layout rather than per-unit data -- e.g. per-experimental-
   * condition intro text. Referenced the same way as unit data columns in
   * `{{...}}` expressions and `::field`/`::tokenize` directives, so
   * `::tokenize[name]` always resolves to ONE stable, versioned string
   * (a real data column OR a layout constant, never a composed/rendered
   * blob) -- preserving the guarantee that stored span character offsets
   * remain meaningful without needing to replay a particular rendering.
   */
  constants: z.record(z.string(), z.string()).optional(),
  style: z.record(z.string(), z.string()).optional().describe("Optional inline CSS for the layout's root container"),
  /** A non-rendered "meta" field, e.g. a source link shown alongside the unit but not part of the template. */
  meta: z.array(UnitLayoutMetaFieldSchema).optional(),
});
export type UnitLayout = z.infer<typeof UnitLayoutSchema>;
