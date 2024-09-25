import { z } from "zod";
import {
  UnitImageLayoutSchema,
  UnitLayoutGridSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "../projects/[projectId]/codebooks/layoutSchemas";
import { CodebookSchema } from "../projects/[projectId]/codebooks/schemas";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { AnnotationSchema } from "../projects/[projectId]/annotations/schemas";
import { error } from "console";

extendZodWithOpenApi(z);

export const UnitFieldValueSchema = z.string();

export const UnitTextContentSchema = UnitTextLayoutSchema.extend({
  grid_area: z.string().optional(),
  value: UnitFieldValueSchema,
}).omit({ column: true });
export const UnitImageContentSchema = UnitImageLayoutSchema.extend({
  grid_area: z.string().optional(),
  value: UnitFieldValueSchema,
}).omit({ column: true });
export const UnitMarkdownContentSchema = UnitMarkdownLayoutSchema.extend({
  grid_area: z.string().optional(),
  value: UnitFieldValueSchema,
}).omit({ column: true });

export const UnitVariableSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const UnitTokenContentSchema = z.object({
  field: z.string(),
  paragraph: z.number(),
  index: z.number(),
  offset: z.number(),
  length: z.number(),
  text: z.string(),
  codingUnit: z.boolean(),
  pre: z.string(),
  post: z.string(),
});

export const UnitContentSchema = z.object({
  textFields: z.array(UnitTextContentSchema).optional(),
  imageFields: z.array(UnitImageContentSchema).optional(),
  markdownFields: z.array(UnitMarkdownContentSchema).optional(),
  tokens: z.array(UnitTokenContentSchema).optional(),
  meta: UnitVariableSchema.optional(),
  grid: UnitLayoutGridSchema.optional(),
});

export const UnitTypeSchema = z.enum(["annotation", "survey"]);

export const AnnotateUnitStatusSchema = z.enum(["IN_PROGRESS", "DONE"]);

export const AnnotateToken = z.string().openapi({
  title: "Token",
  description: "A signed JWT token that provides (temporary) access to annotate this unit.",
  example: "1234",
});

export const AnnotateUnitSchema = z
  .object({
    token: z.string(),
    type: UnitTypeSchema,
    status: AnnotateUnitStatusSchema,
    content: UnitContentSchema,
    annotations: z.array(AnnotationSchema),
    codebook: CodebookSchema.optional(),
    codebook_id: z.number().optional(),
    codebook_modified: z.coerce.date().optional(),
  })
  .refine((unit) => {
    if (!unit.codebook && !unit.codebook_id) {
      throw new Error("Either codebook or codebook_id must be provided");
    }
  });

export const AnnotateProgressSchema = z.object({
  currentUnit: z.number(),
  previousUnit: z.number().optional(),
  nTotal: z.number(),
  nCoded: z.number(),
  seekBackwards: z.boolean().optional(),
  seekForwards: z.boolean().optional(),
});

export const GetUnitResponseSchema = z.object({
  unit: AnnotateUnitSchema.nullable(),
  progress: AnnotateProgressSchema,
  error: z.string().optional(),
});

export const GetCodebookResponseSchema = z.object({
  codebook: CodebookSchema.nullable(),
  error: z.string().optional(),
});
