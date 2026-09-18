import { z } from "zod";

/**
 * A single selectable code/answer option shown to the coder.
 * Ported from old/src/app/api/.../codebookNodes/variableSchemas.ts.
 */
export const CodebookCodeSchema = z.object({
  code: z.string().min(1).trim().describe("The code value shown to the annotator. Must be unique within the variable."),
  color: z.string().optional().describe("Optional custom color for displaying the code, e.g. '#FF0000' or 'red'."),
  value: z.number().optional().describe("Optional numeric value associated with the code. Must be unique within the variable if set."),
  /**
   * NEW vs. old design: selecting a code with `screenOut: true` ends the
   * coder's session for this job (a lightweight replacement for a dedicated
   * "screen-out question" item type -- see design plan §2/§6 notes).
   */
  screenOut: z.boolean().optional().describe("If true, selecting this code ends the coder's session (screens them out of the job)."),
});
export type CodebookCode = z.infer<typeof CodebookCodeSchema>;

function uniqueCodesRefinement(codes: CodebookCode[]) {
  const names = codes.map((c) => c.code);
  if (new Set(names).size !== names.length) return false;
  const values = codes.map((c) => c.value).filter((v) => v != null);
  if (new Set(values).size !== values.length) return false;
  return true;
}

export const CodebookCodesSchema = z
  .array(CodebookCodeSchema)
  .min(1, "At least one code is required")
  .refine(uniqueCodesRefinement, { message: "Codes and values must be unique" });

/** Swipe-based answering (annotinder type) supports at most 3 codes: left/right/up. */
export const CodebookSwipeCodesSchema = z
  .array(CodebookCodeSchema)
  .min(1)
  .max(3)
  .refine(uniqueCodesRefinement, { message: "Codes and values must be unique" });
