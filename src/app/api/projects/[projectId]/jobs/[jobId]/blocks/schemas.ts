import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { QuestionVariableSchema, SpanVariableSchema } from "./variableSchemas";
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

export const JobBlockDataTypeSchema = z.object({
  type: z.enum(blockType).openapi({
    title: "Type",
    description: "The type of the block",
  }),
});

export const JobBlockQuestionVariableSchema = JobBlockDataTypeSchema.extend({
  type: z.literal("Question task"),
  variable: QuestionVariableSchema,
});

export const JobBlockSpanVariableSchema = JobBlockDataTypeSchema.extend({
  type: z.literal("Annotation task"),
  variable: SpanVariableSchema,
});

export const JobBlockAnnotationPhaseSchema = JobBlockDataTypeSchema.extend({
  type: z.literal("Annotation phase"),
  layout: UnitLayoutSchema,
});

export const JobBlockSurveyPhaseSchema = JobBlockDataTypeSchema.extend({
  type: z.literal("Survey phase"),
});

export const JobBlockAnnotationGroupSchema = JobBlockDataTypeSchema.extend({
  type: z.literal("Annotation group"),
  layout: UnitLayoutSchema,
});

export const JobBlockSurveyGroupSchema = JobBlockDataTypeSchema.extend({
  type: z.literal("Survey group"),
});

export const JobBlockDataSchema = z.discriminatedUnion("type", [
  JobBlockQuestionVariableSchema,
  JobBlockSpanVariableSchema,
  JobBlockAnnotationPhaseSchema,
  JobBlockAnnotationGroupSchema,
  JobBlockSurveyPhaseSchema,
  JobBlockSurveyGroupSchema,
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
