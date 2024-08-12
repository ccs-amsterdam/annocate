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
  method: z.enum(["fixed", "crowd"]),
  maxPerCoder: z.number(),
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

export const CreateJobBlockSchema = z.union([JobSurveyBlockSchema, JobAnnotationBlockSchema]);
export const UpdateJobBlockSchema = z.union([JobSurveyBlockSchema.partial(), JobAnnotationBlockSchema.partial()]);

export const JobsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  // blocks: z.array(JobBlockSchema),
});

export const JobResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});
