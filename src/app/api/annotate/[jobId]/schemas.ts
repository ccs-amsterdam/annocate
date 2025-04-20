import { z } from "zod";
import {
  UnitImageLayoutSchema,
  UnitLayoutGridSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/layoutSchemas";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { AnnotationSchema, QuestionAnnotationSchema } from "@/app/api/projects/[projectId]/annotations/schemas";
import { error } from "console";
import { UnitDataSchema } from "../../projects/[projectId]/jobs/[jobId]/units/schemas";

extendZodWithOpenApi(z);

export const ProgressStatusSchema = z.enum(["pending", "done", "skip"]);

export const UnitFieldValueSchema = z.string();

export const AnnotateToken = z.string().openapi({
  title: "Token",
  description: "A secret token that is need to submit the annotations (in jobServer.postAnnotations)",
  example: "jesfdlfji",
});

export const AnnotateUnitSchema = z.object({
  token: AnnotateToken,
  status: ProgressStatusSchema,
  data: UnitDataSchema.optional(),
  annotations: z.array(AnnotationSchema),
});

// const VariableProgressSchema = z.object({
//   label: z.string(),
//   status: ProgressStatusSchema,
// });
//
export const PhaseTypeSchema = z.enum(["survey", "annotation"]);

const PhaseProgressSchema = z.object({
  type: PhaseTypeSchema,
  label: z.string(),
  status: ProgressStatusSchema,
  // variables: z.array(VariableProgressSchema),
});

export const SurveyPhaseProgressSchema = PhaseProgressSchema.extend({
  type: z.literal("survey"),
});
export const AnnotatePhaseProgressSchema = PhaseProgressSchema.extend({
  type: z.literal("annotation"),
  currentUnit: z.number(),
  nTotal: z.number(),
  nCoded: z.number(),
});

export const AnnotateProgressSchema = z.object({
  phase: z.number(),
  phases: z.array(z.discriminatedUnion("type", [SurveyPhaseProgressSchema, AnnotatePhaseProgressSchema])),
  settings: z.object({
    canSkip: z.boolean().default(false),
    canGoBack: z.boolean().default(true),
  }),
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
  progress: AnnotateProgressSchema,
  globalAnnotations: z.array(AnnotationSchema),
});

export const GetUnitResponseSchema = z.object({
  unit: z.object({
    token: z.string(),
    data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    annotations: z.array(AnnotationSchema),
    status: ProgressStatusSchema,
  }),
  phaseProgress: z.object({
    nCoded: z.number(),
    nTotal: z.number(),
    currentUnit: z.number(),
  }),
});

export const GetUnitParamsSchema = z.object({
  userId: z.string().optional(),
  unitId: z.string().optional(),
});

// POSTANNOTATIONS
export const PostAnnotationUpdateSchema = z.object({
  unitToken: z
    .string()
    .openapi({
      title: "Token",
      description: "If this is a unit annotation, a token is required to identify the right unit",
    })
    .optional(),
  // validationToken: z.string().openapi({
  //   title: "Token",
  //   description: "A token that is needed to validate the annotation",
  // }),
  annotation: AnnotationSchema,
});
