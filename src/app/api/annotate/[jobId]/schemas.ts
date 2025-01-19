import { z } from "zod";
import {
  UnitImageLayoutSchema,
  UnitLayoutGridSchema,
  UnitMarkdownLayoutSchema,
  UnitTextLayoutSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/layoutSchemas";
import { CodebookSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { AnnotationSchema } from "@/app/api/projects/[projectId]/annotations/schemas";
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

export const AnnotateUnitSchema = z.object({
  token: z.string(),
  type: UnitTypeSchema,
  status: AnnotateUnitStatusSchema,
  content: UnitContentSchema,
  annotations: z.array(AnnotationSchema),
  blockId: z.number(),
});

export const AnnotateProgressSchema = z.object({
  currentUnit: z.number(),
  previousUnit: z.number().optional(),
  nTotal: z.number(),
  nCoded: z.number(),
  seekBackwards: z.boolean().optional(),
  seekForwards: z.boolean().optional(),
});

export const JobBlockSchema = z.object({
  id: z.number(),
  phase: z.enum(["preSurvey", "annotate", "postSurvey"]),
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
  blocks: z.array(JobBlockSchema),
});

export const GetUnitResponseSchema = z.object({
  token: z.string(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  annotations: z.array(AnnotationSchema),
});

export const GetCodebookResponseSchema = z.object({
  codebook: CodebookSchema.nullable(),
  error: z.string().optional(),
});

export const GetUnitParamsSchema = z.object({
  userId: z.string().optional(),
  unitId: z.string().optional(),
});
