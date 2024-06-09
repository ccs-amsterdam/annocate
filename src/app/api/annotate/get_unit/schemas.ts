import { z } from "zod";
import { UnitDataValueSchema } from "../../projects/[projectId]/units/schemas";
import {
  UnitImageLayoutSchema,
  UnitLayoutGridSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "../../projects/[projectId]/units/layouts/schemas";
import { CodebookSchema } from "../../projects/[projectId]/codebooks/schemas";

export const UnitFieldValueSchema = z.string();

export const UnitTextContentSchema = UnitTextLayoutSchema.extend({
  value: UnitFieldValueSchema,
});
export const UnitImageContentSchema = UnitImageLayoutSchema.extend({
  value: UnitFieldValueSchema,
});
export const UnitMarkdownContentSchema = UnitMarkdownLayoutSchema.extend({
  value: UnitFieldValueSchema,
});
export const UnitVariableSchema = z.record(z.string(), UnitDataValueSchema);

export const AnnotateUnitSchema = z.object({
  id: z.number(),
  content: z.array(z.union([UnitTextContentSchema, UnitImageContentSchema, UnitMarkdownContentSchema])),
  variables: UnitVariableSchema.optional(),
  grid: UnitLayoutGridSchema.optional(),
  codebook: CodebookSchema.optional(),
  codebook_id: z.number().optional(),
});

export const AnnotateProgressSchema = z.object({
  current: z.number(),
  n_total: z.number(),
  n_coded: z.number(),
  seek_backwards: z.boolean().optional(),
  seek_forwards: z.boolean().optional(),
});
