import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JobsTableParamsSchema = createTableParamsSchema({});

export const JobSurveyBlockSchema = z.object({
  type: z.literal("survey"),
  codebookId: z.number(),
});

export const UnitBlockRulesSchema = z.object({
  method: z.enum(["fixed", "crowd"]),
  maxPerCoder: z.number(),
});

export const JobUnitsBlockSchema = z.object({
  type: z.literal("units"),
  codebookId: z.number(),
  units: z.array(z.string()),
  rules: UnitBlockRulesSchema,
});

export const AdvancedJobSpecificationSchema = z.array(z.union([JobSurveyBlockSchema, JobUnitsBlockSchema]));

// make api only provide advanced option.
// simplification is purely a client thing
//

export const JobSettingsSchema = z.object({
  codebookId: z.number().optional(),
  units: z.array(z.string()).optional(),
  surveyPre: z.array(z.string()).optional(),
  surveyPost: z.array(z.string()).optional(),
  advanced: AdvancedJobSpecificationSchema.optional(),
});

export const JobCreateSchema = JobSettingsSchema.extend({ name: z.string() });
export const JobUpdateSchema = JobSettingsSchema.extend({ name: z.string().optional() });

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
