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
import { UnitDataSchema } from "../../projects/[projectId]/units/schemas";

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

export const PhaseSchema = z.enum(["preSurvey", "annotate", "postSurvey"]);

export const SurveyPhaseSchema = z.object({
  type: z.literal("survey"),
});
export const AnnotatePhaseSchema = z.object({
  type: z.literal("annotation"),
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

export const JobBlockSchema = z.object({
  id: z.number(),
  phase: PhaseSchema,
  position: z.number(),
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
