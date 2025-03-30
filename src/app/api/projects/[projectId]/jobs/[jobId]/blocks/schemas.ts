import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { VariableSchema } from "./variableSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";
import { blockType } from "@/app/types";
import { AnnotationPhaseSchema, SurveyPhaseSchema } from "./phaseSchemas";

extendZodWithOpenApi(z);

export const JobBlockSchemaBase = z.object({
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
  parentId: z.number().nullable().openapi({
    title: "Job Block parent ID",
    description: "The ID of the parent of this block, or null if it is a root block",
  }),
  position: z.number().openapi({
    title: "Position",
    description: "The position of the block in the list of children of the parent block",
  }),
});

export const JobBlockSurveyQuestionSchema = JobBlockSchemaBase.extend({
  type: z.literal("surveyQuestion"),
  content: VariableSchema,
});

export const JobBlockAnnotationQuestionSchema = JobBlockSchemaBase.extend({
  type: z.literal("annotationQuestion"),
  content: VariableSchema,
});

export const JobBlockAnnotationPhaseSchema = JobBlockSchemaBase.extend({
  type: z.literal("annotationPhase"),
  content: AnnotationPhaseSchema,
});

export const JobBlockSurveyPhaseSchema = JobBlockSchemaBase.extend({
  type: z.literal("surveyPhase"),
  content: SurveyPhaseSchema,
});

export const JobBlockCreateSchema = z.discriminatedUnion("type", [
  JobBlockSurveyQuestionSchema,
  JobBlockAnnotationQuestionSchema,
  JobBlockAnnotationPhaseSchema,
  JobBlockSurveyPhaseSchema,
]);

export const JobBlockUpdateSchema = z.object({
  name: JobBlockSchemaBase.shape.name.optional(),
  parentId: JobBlockSchemaBase.shape.parentId.optional(),
  position: JobBlockSchemaBase.shape.position.optional(),
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

// For this endpoint we process the response from the server client side,
// so the response schema for the server is different from the response schema for the client
export const JobBlocksServerResponseSchema = z.discriminatedUnion("type", [
  JobBlockSurveyQuestionSchema.extend({ id: z.number() }),
  JobBlockAnnotationQuestionSchema.extend({ id: z.number() }),
  JobBlockAnnotationPhaseSchema.extend({ id: z.number() }),
  JobBlockSurveyPhaseSchema.extend({ id: z.number() }),
]);

export const JobBlocksResponseAddSchema = JobBlockSchemaBase.extend({
  id: z.number(),
  level: z.number(),
  children: z.number(),
});

export const JobBlocksResponseSchema = z.discriminatedUnion("type", [
  JobBlocksResponseAddSchema.merge(JobBlockSurveyQuestionSchema),
  JobBlocksResponseAddSchema.merge(JobBlockAnnotationQuestionSchema),
  JobBlocksResponseAddSchema.merge(JobBlockAnnotationPhaseSchema),
  JobBlocksResponseAddSchema.merge(JobBlockSurveyPhaseSchema),
]);

// omit name
export const JobBlocksUpdateResponseSchema = z.object({
  tree: z.array(
    z.object({
      id: z.number(),
      parentId: z.number().nullable(),
      position: z.number(),
    }),
  ),
  block: JobBlocksServerResponseSchema,
});
