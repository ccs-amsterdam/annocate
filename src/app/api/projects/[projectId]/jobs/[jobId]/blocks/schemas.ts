import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { VariableSchema } from "./variableSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";
import { blockType } from "@/app/types";

extendZodWithOpenApi(z);

export const JobBlockSchemaBase = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the block. Will not be visible to annotators. Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
    example: "unique_block_name",
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

export const JobBlockSurveyQuestionSchema = z.object({
  type: z.literal("surveyQuestion"),
  variable: VariableSchema,
});

export const JobBlockAnnotationQuestionSchema = z.object({
  type: z.literal("annotationQuestion"),
  variable: VariableSchema,
});

export const JobBlockAnnotationPhaseSchema = z.object({
  type: z.literal("annotationPhase"),
  layout: UnitLayoutSchema,
});

export const JobBlockSurveyPhaseSchema = z.object({
  type: z.literal("surveyPhase"),
});

export const JobBlockDataSchema = z.discriminatedUnion("type", [
  JobBlockSurveyQuestionSchema,
  JobBlockAnnotationQuestionSchema,
  JobBlockAnnotationPhaseSchema,
  JobBlockSurveyPhaseSchema,
]);

export const JobBlockCreateSchema = JobBlockSchemaBase.extend({ data: JobBlockDataSchema });

export const JobBlockUpdateSchema = JobBlockSchemaBase.partial().extend({
  data: JobBlockDataSchema.optional(),
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
export const JobBlocksServerResponseSchema = JobBlockSchemaBase.extend({ id: z.number(), data: JobBlockDataSchema });

export const JobBlocksResponseSchema = JobBlockSchemaBase.extend({
  id: z.number(),
  level: z.number(),
  children: z.number(),
  data: JobBlockDataSchema,
});

const TreeUpdateSchema = z.array(
  z.object({
    id: z.number(),
    parentId: z.number().nullable(),
    position: z.number(),
  }),
);

export const JobBlocksCreateResponseSchema = z.object({
  tree: TreeUpdateSchema,
  block: JobBlocksServerResponseSchema,
});

export const JobBlocksUpdateResponseSchema = z.object({
  tree: TreeUpdateSchema.optional(),
  block: z.object({
    id: z.number(),
    name: z.string().optional(),
    data: JobBlockDataSchema.optional(),
  }),
});
