import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JobsTableParamsSchema = createTableParamsSchema({});

export const JobSurveyBlockSchema = z.object({
  type: z.literal("survey"),
  codebookId: z.number(),
});

export const JobUnitBlockRulesSchema = z.object({
  method: z.enum(["fixed", "crowd"]),
  maxPerCoder: z.number(),
});

export const JobUnitsBlockSchema = z.object({
  type: z.literal("units"),
  codebookId: z.number(),
  units: z.array(z.string()),
  rules: JobUnitBlockRulesSchema,
});

export const JobBlockSchema = z.array(z.union([JobSurveyBlockSchema, JobUnitsBlockSchema]));

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

export const AddJobBlockSchema = z.object({
  block: JobBlockSchema,
  position: z.number().optional(),
});

export const MoveJobBlockSchema = z.object({
  from: z.number(),
  to: z.number(),
});

export const JobsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  n_units: z.number(),
  codebookId: z.number(),
  codebookName: z.string(),
});

export const JobResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  units: z.array(z.string()),
  codebookId: z.number(),
  codebookName: z.string(),
});
