import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JobsTableParamsSchema = createTableParamsSchema({});

export const JobBlockBaseSchema = z.object({
  type: z.enum(["survey", "annotation"]),
  position: z.number(),
  codebookId: z.number(),
});

export const JobSurveyBlockSchema = JobBlockBaseSchema.extend({
  type: z.literal("survey"),
});

export const JobAnnotationBlockRulesSchema = z.object({
  maxUnitsPerCoder: z.number().int().min(1).nullish(),
  maxCodersPerUnit: z.number().int().min(1).nullish(),
  overlapUnits: z.number().int().min(1).nullish(),
  randomizeUnits: z.boolean().default(true),
});

export const JobAnnotationBlockSchema = JobBlockBaseSchema.extend({
  type: z.literal("annotation"),
  units: z.array(z.string()),
  rules: JobAnnotationBlockRulesSchema,
});

export const JobBlockSchema = z.union([JobSurveyBlockSchema, JobAnnotationBlockSchema]);

// current idea is that jobs have blocks.
// each block has a codebook, which can be a survey or annotation type.
// annotation blocks furthermore have units, and rules for how to select units.
// add 'preview' at block level.
// and at codebook level.

export const JobCreateSchema = z.object({
  name: z.string(),
});

export const JobUpdateSchema = z.object({
  name: z.string(),
});

export const JobBlockCreateSchema = z.union([JobSurveyBlockSchema, JobAnnotationBlockSchema]);
export const JobBlockUpdateSchema = z.union([JobSurveyBlockSchema.partial(), JobAnnotationBlockSchema.partial()]);

export const JobsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  modified: z.coerce.date(),
  deployed: z.boolean(),
  // blocks: z.array(JobBlockSchema),
});

export const JobBlockResponseSchema = z.object({
  id: z.number(),
  type: z.enum(["survey", "annotation"]),
  position: z.number(),
  codebookId: z.number(),
  codebookName: z.string(),
  rules: JobAnnotationBlockRulesSchema,
  n_units: z.number(),
});

export const JobResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  modified: z.coerce.date(),
  deployed: z.boolean(),
  blocks: z.array(JobBlockResponseSchema),
});
