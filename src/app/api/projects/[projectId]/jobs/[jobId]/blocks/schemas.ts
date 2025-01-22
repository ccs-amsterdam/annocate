import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { CodebookVariablesSchema, VariableSchema } from "./variableSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";
import { blockType } from "@/app/types";
import { AnnotationPhaseSchema, SurveyPhaseSchema } from "./phaseSchemas";

extendZodWithOpenApi(z);

export const JobBlocksParamsSchema = z.object({
  treeOnly: z.coerce
    .boolean()
    .optional()
    .openapi({ title: "Tree only", description: "Only return the tree structure of the job blocks" }),
});

// We split the jobBlock into the position and content information.
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
});

const JobBlockNameSchema = SafeNameSchema.openapi({
  title: "Name",
  description:
    "The name of the block. Will not be visible to annotators. Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
  example: "unique_block_name",
});

export const JobBlockContentSurveyQuestionSchema = JobBlockContentSchemaBase.extend({
  type: z.literal("surveyQuestion"),
  name: JobBlockNameSchema,
  content: VariableSchema,
});

export const JobBlockContentAnnotationQuestionSchema = JobBlockContentSchemaBase.extend({
  type: z.literal("annotationQuestion"),
  name: JobBlockNameSchema,
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

export const JobBlockSurveyGroupSchema = z.object({
  type: z.enum(["group"]),
  name: JobBlockNameSchema.optional(),
  // content has branching logic
});

export const JobBlockAnnotationGroupSchema = z.object({
  type: z.enum(["group"]),
  name: JobBlockNameSchema.optional(),
  // content has branching plus unit layout
});

export const JobBlockContentSchema = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema,
  JobBlockContentAnnotationQuestionSchema,
  JobBlockContentAnnotationPhaseSchema,
  JobBlockContentSurveyPhaseSchema,
]);

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
export const JobBlockTreeUpdateSchema = JobBlockTreeSchema.partial();

export const JobBlockContentUpdateSchema = z.object({
  name: JobBlockNameSchema.optional(),
  content: z.union([VariableSchema, AnnotationPhaseSchema, SurveyPhaseSchema]).optional(),
});

export const JobBlockUpdateSchema = JobBlockTreeSchema.partial().extend({
  name: JobBlockNameSchema.optional(),
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

export const JobBlockTreeResponseSchema = JobBlockTreeSchema.extend({
  id: z.number(),
  level: z.number(),
  children: z.number(),
});

export const JobBlockResponseSchema = z.discriminatedUnion("type", [
  JobBlockContentSurveyQuestionSchema.extend({ id: z.number() }),
  JobBlockContentAnnotationQuestionSchema.extend({ id: z.number() }),
  JobBlockContentAnnotationPhaseSchema.extend({ id: z.number() }),
  JobBlockContentSurveyPhaseSchema.extend({ id: z.number() }),
]);

export const JobBlocksResponseSchema = z.union([
  JobBlockTreeResponseSchema,
  z.discriminatedUnion("type", [
    JobBlockTreeResponseSchema.merge(JobBlockContentSurveyQuestionSchema).extend({ id: z.number() }),
    JobBlockTreeResponseSchema.merge(JobBlockContentAnnotationQuestionSchema).extend({ id: z.number() }),
    JobBlockTreeResponseSchema.merge(JobBlockContentAnnotationPhaseSchema).extend({ id: z.number() }),
    JobBlockTreeResponseSchema.merge(JobBlockContentSurveyPhaseSchema).extend({ id: z.number() }),
  ]),
]);
