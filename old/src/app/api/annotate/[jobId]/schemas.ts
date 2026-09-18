import { z } from "zod";
import {
  UnitImageLayoutSchema,
  UnitLayoutGridSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/layoutSchemas";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  AnnotationSchema,
  QuestionAnnotationSchema,
  VariableAnnotationsSchema,
} from "@/app/api/projects/[projectId]/annotations/schemas";
import { error } from "console";
import { UnitDataSchema } from "../../projects/[projectId]/jobs/[jobId]/units/schemas";
import { CodebookNodes } from "@/app/projects/[projectId]/jobs/[jobId]/codebook/CodebookNodes";
import { CodebookNodeResponseSchema } from "../../projects/[projectId]/jobs/[jobId]/codebookNodes/schemas";

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
  phaseId: z.number(),
  unitsDone: z.array(z.boolean()),
});

export const GetSessionParamsSchema = z
  .object({
    userId: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.number()]));

export const GetSessionResponseSchema = z.object({
  sessionToken: z.string(),
  codebook: z.array(CodebookNodeResponseSchema),
  phaseProgress: z.array(PhaseProgressSchema),
  globalAnnotations: z.record(z.number(), VariableAnnotationsSchema),
});

const VariableIdSchema = z.number();

export const GetUnitResponseSchema = z.object({
  unit: z.object({
    token: z.string(),
    data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    variableAnnotations: z.record(VariableIdSchema, VariableAnnotationsSchema),
    done: z.boolean(),
  }),
});

export const GetUnitParamsSchema = z.object({
  userId: z.string().optional(),
  unitId: z.string().optional(),
});

const PhaseTokenSchema = z.string().openapi({
  title: "Phase Token",
  description: "A token for authorizing the user to annotate this phase",
});

// POSTANNOTATIONS (allow passing an array of this)
export const PostAnnotationUpdateSchema = z.object({
  sessionToken: z.string(),
  phaseAnnotations: z.record(PhaseTokenSchema, z.record(VariableIdSchema, VariableAnnotationsSchema.partial())),
});

export const PostAnnotationResponseSchema = z.object({
  sessionToken: z.string().optional(),
});
