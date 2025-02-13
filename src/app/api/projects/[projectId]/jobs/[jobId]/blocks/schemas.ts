import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { VariableSchema } from "./variableSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";
import { blockType } from "@/app/types";
import { AnnotationPhaseSchema, SurveyPhaseSchema } from "./phaseSchemas";

extendZodWithOpenApi(z);

// We split the jobBlock into the position and content information.
// This is for efficient updating and caching in the web client
export const JobBlockTreeSchema = z.object({
  parentId: z.number().nullable().openapi({ title: "Job Block parent ID", description: "The ID of another job Block" }),
  position: z.number().openapi({ title: "Block position", description: "Position of the block in the job" }),
});

export const JobBlockContentSchemaBase = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the block. Will not be visible to annotators. Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
    example: "unique_block_name",
  }),
  type: z.enum(blockType).openapi({
    title: "Block type",
    description:
      "The type of the block. Can be 'surveyPhase', 'annotationPhase', 'surveyQuestion' or 'annotationQuestion'",
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

// This is used for type hinting the drizzle/ps table definitions
export const JobBlockContentSchema = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema,
  JobBlockContentAnnotationQuestionSchema,
  JobBlockContentAnnotationPhaseSchema,
  JobBlockContentSurveyPhaseSchema,
]);

// This is used to validate content in the update endpoint
export const JobBlockContentTypeValidator = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema.pick({ type: true, content: true }),
  JobBlockContentAnnotationQuestionSchema.pick({ type: true, content: true }),
  JobBlockContentAnnotationPhaseSchema.pick({ type: true, content: true }),
  JobBlockContentSurveyPhaseSchema.pick({ type: true, content: true }),
]);

// CREATE

export const JobBlockCreateSchema = z.discriminatedUnion("type", [
  JobBlockTreeSchema.merge(JobBlockContentSurveyQuestionSchema),
  JobBlockTreeSchema.merge(JobBlockContentAnnotationQuestionSchema),
  JobBlockTreeSchema.merge(JobBlockContentAnnotationPhaseSchema),
  JobBlockTreeSchema.merge(JobBlockContentSurveyPhaseSchema),
]);

// UPDATE
export const JobBlocksTreeUpdateSchema = JobBlockTreeSchema.partial();

export const JobBlockContentUpdateSchema = z.object({
  name: JobBlockContentSchemaBase.shape.name.optional(),
  content: z.union([VariableSchema, AnnotationPhaseSchema, SurveyPhaseSchema]).optional(),
});

export const JobBlockUpdateSchema = JobBlockTreeSchema.partial().extend({
  name: JobBlockContentSchemaBase.shape.name.optional(),
  content: z.union([VariableSchema, AnnotationPhaseSchema, SurveyPhaseSchema]).optional(),
});

// DELETE

export const JobBlockDeleteSchema = z.object({
  recursive: z.coerce.boolean().optional().openapi({
    title: "Recursive",
    description: "Delete all children blocks. If false, trying to delete a block with children will throw an error",
  }),
});

// RESPONSE

// This is the trimmed down version of JobBlocksResponse, for efficient caching client side
export const JobBlocksResponseSchemaAddTree = JobBlockTreeSchema.extend({
  id: z.number(),
  level: z.number(),
  children: z.number(),
});

// When getting all blocks, we do include the tree details (and sort by tree branches)
export const JobBlocksResponseSchema = z.discriminatedUnion("type", [
  JobBlocksResponseSchemaAddTree.merge(JobBlockContentSurveyQuestionSchema).extend({ id: z.number() }),
  JobBlocksResponseSchemaAddTree.merge(JobBlockContentAnnotationQuestionSchema).extend({ id: z.number() }),
  JobBlocksResponseSchemaAddTree.merge(JobBlockContentAnnotationPhaseSchema).extend({ id: z.number() }),
  JobBlocksResponseSchemaAddTree.merge(JobBlockContentSurveyPhaseSchema).extend({ id: z.number() }),
]);
