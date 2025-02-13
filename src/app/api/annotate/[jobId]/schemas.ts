import { z } from "zod";
import {
  UnitImageLayoutSchema,
  UnitLayoutGridSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/layoutSchemas";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { AnnotationSchema } from "@/app/api/projects/[projectId]/annotations/schemas";
import { error } from "console";
import { blockType } from "@/app/types";
import { UnitDataSchema } from "../../projects/[projectId]/jobs/[jobId]/units/schemas";

extendZodWithOpenApi(z);

export const UnitFieldValueSchema = z.string();

export const UnitVariableSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const UnitTypeSchema = z.enum(["annotation", "survey"]);

export const AnnotateUnitStatusSchema = z.enum(["IN_PROGRESS", "DONE"]);

export const AnnotateToken = z.string().openapi({
  title: "Token",
  description: "A secret token that is need to submit the annotations (in jobServer.postAnnotations)",
  example: "jesfdlfji",
});

export const AnnotateUnitSchema = z.object({
  token: z.string(),
  type: UnitTypeSchema,
  status: AnnotateUnitStatusSchema,
  data: UnitDataSchema.optional(),
  annotations: z.array(AnnotationSchema),
});

export const SurveyPhaseSchema = z.object({
  type: z.literal("survey"),
  label: z.string(),
});
export const AnnotatePhaseSchema = z.object({
  type: z.literal("annotation"),
  label: z.string(),
  currentUnit: z.number(),
  nTotal: z.number(),
  nCoded: z.number(),
});

export const AnnotateProgressSchema = z.object({
  phase: z.number(),
  phasesCoded: z.number(),
  phases: z.array(z.discriminatedUnion("type", [SurveyPhaseSchema, AnnotatePhaseSchema])),
  seekForwards: z.boolean().optional(),
  seekBackwards: z.boolean().optional(),
});

const JobStateAnnotationCode = z.union([z.array(z.string()), z.string()]);
const JobStateAnnotationValue = z.union([z.array(z.number()), z.number()]);
export const JobStateAnnotationSchema = z.object({
  code: JobStateAnnotationCode.optional(),
  value: JobStateAnnotationValue.optional(),
});
export const JobStateAnnotationsSchema = z.record(z.string(), JobStateAnnotationSchema);

export const GetJobStateParamsSchema = z
  .object({
    userId: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.number()]));

export const GetJobStateResponseSchema = z.object({
  surveyAnnotations: JobStateAnnotationsSchema,
  unitAnnotations: JobStateAnnotationsSchema,
});

export const GetUnitResponseSchema = z.object({
  token: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  annotations: z.array(AnnotationSchema),
  progress: AnnotateProgressSchema,
  status: AnnotateUnitStatusSchema,
});

export const GetUnitParamsSchema = z.object({
  userId: z.string().optional(),
  unitId: z.string().optional(),
});
