import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { CodebookVariablesSchema, VariableSchema } from "./variableSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";
import { blockType } from "@/app/types";
import { AnnotationPhaseSchema, SurveyPhaseSchema } from "./phaseSchemas";

extendZodWithOpenApi(z);

// export const CodebookSettingsSchema = z.object({
//   instruction: z
//     .string()
//     .optional()
//     .openapi({
//       title: "Instruction",
//       description: `Codebooks can contain general instructions for the annotator. These will be shown the first time the annotator sees the codebook in a session,
//        and can be opened again by clicking the instruction button.`,
//     }),
// });

// export const CodebookBaseSchema = z.object({
//   type: z.enum(["survey", "annotation"]),
//   variables: CodebookVariablesSchema.openapi({
//     title: "Variables",
//     description: "The variables that will be shown to the annotator",
//   }),
//   settings: CodebookSettingsSchema,
// });

// export const CodebookSurveySchema = CodebookBaseSchema.extend({
//   type: z.literal("survey"),
// });

// export const CodebookAnnotationSchema = CodebookBaseSchema.extend({
//   type: z.literal("annotation"),
//   unit: UnitLayoutSchema.optional().openapi({
//     title: "Unit",
//     description: "Change unit design for this ",
//   }),
// });

// // !!!!!!!!!!!!!!!!
// // We WILL still have a codebook schema, but this will be for the full collection
// // of Job Blocks. This won't have a form, and is only meant for the API, so that
// // in R and stuff you can just upload a full validated codebook at once. Only on webclient
// // do we need the separate jobblock endpoints

// export const CodebookSchema = z.union([CodebookSurveySchema, CodebookAnnotationSchema]);
// export const CodebookUpdateSchema = z.object({
//   codebook: CodebookSchema,
// });

// //////////////////////////////////////////////////////////

// export const CodebooksTableParamsSchema = createTableParamsSchema({
//   add: {
//     type: z.enum(["survey", "annotation"]).optional().openapi({
//       title: "Type",
//       description: "Filter by codebook type",
//       example: "survey",
//     }),
//   },
// });

// Here we split the jobBlock into the position and content information.
// This is for efficient updating and caching in the web client
export const JobBlockTreeSchema = z.object({
  parentId: z.number().nullable().openapi({ title: "Job Block parent ID", description: "The ID of another job Block" }),
  position: z.number().openapi({ title: "Block position", description: "Position of the block in the job" }),
});

export const JobBlockContentSchemaBase = z.object({
  type: z.enum(blockType).openapi({
    title: "Block type",
    description:
      "The type of the block. Can be 'surveyPhase', 'annotationPhase', 'surveyQuestion' or 'annotationQuestion'",
  }),
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the block. Will not be visible to annotators. Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
    example: "unique_block_name",
  }),
});

export const JobBlockContentSurveyQuestionSchema = JobBlockContentSchemaBase.extend({
  type: z.literal("surveyQuestion"),
  content: VariableSchema,
});

export const JobBlockContentAnnotationQuestionSchema = JobBlockContentSchemaBase.extend({
  type: z.literal("annotationQuestion"),
  content: VariableSchema,
});

export const JobBlockContentAnnotationPhaseSchema = JobBlockContentSchemaBase.extend({
  type: z.literal("annotationPhase"),
  content: AnnotationPhaseSchema,
});

export const JobBlockContentSurveyPhaseSchema = JobBlockContentSchemaBase.extend({
  type: z.literal("surveyPhase"),
  content: SurveyPhaseSchema,
});

export const JobBlockContentSchema = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema,
  JobBlockContentAnnotationQuestionSchema,
  JobBlockContentAnnotationPhaseSchema,
  JobBlockContentSurveyPhaseSchema,
]);

export const JobBlockContentUpdateSchema = z.object({
  name: JobBlockContentSchemaBase.shape.name,
  content: z.union([VariableSchema, AnnotationPhaseSchema, SurveyPhaseSchema]),
});

export const JobBlockContentTypeValidator = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema.pick({ type: true, content: true }),
  JobBlockContentAnnotationQuestionSchema.pick({ type: true, content: true }),
  JobBlockContentAnnotationPhaseSchema.pick({ type: true, content: true }),
  JobBlockContentSurveyPhaseSchema.pick({ type: true, content: true }),
]);

export const JobBlockCreateSchema = z.discriminatedUnion("type", [
  JobBlockTreeSchema.merge(JobBlockContentSurveyQuestionSchema),
  JobBlockTreeSchema.merge(JobBlockContentAnnotationQuestionSchema),
  JobBlockTreeSchema.merge(JobBlockContentAnnotationPhaseSchema),
  JobBlockTreeSchema.merge(JobBlockContentSurveyPhaseSchema),
]);

export const JobBlockResponseSchema = z.discriminatedUnion("type", [
  JobBlockTreeSchema.merge(JobBlockContentSurveyQuestionSchema).extend({ id: z.number() }),
  JobBlockTreeSchema.merge(JobBlockContentAnnotationQuestionSchema).extend({ id: z.number() }),
  JobBlockTreeSchema.merge(JobBlockContentAnnotationPhaseSchema).extend({ id: z.number() }),
  JobBlockTreeSchema.merge(JobBlockContentSurveyPhaseSchema).extend({ id: z.number() }),
]);

export const JobBlockContentResponseSchema = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema.extend({ id: z.number() }),
  JobBlockContentAnnotationQuestionSchema.extend({ id: z.number() }),
  JobBlockContentAnnotationPhaseSchema.extend({ id: z.number() }),
  JobBlockContentSurveyPhaseSchema.extend({ id: z.number() }),
]);

export const JobBlockTreeUpdateSchema = JobBlockTreeSchema.partial();

export const JobBlockTreeResponseSchema = JobBlockTreeSchema.extend({
  id: z.number(),
  level: z.number(),
  children: z.number(),
});
