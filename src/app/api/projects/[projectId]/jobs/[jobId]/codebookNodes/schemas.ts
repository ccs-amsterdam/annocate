import { createTableParamsSchema, SafeNameSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { QuestionVariableSchema, SpanVariableSchema } from "./variableSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";
import { codebookNodeType } from "@/app/types";

extendZodWithOpenApi(z);

export const CodebookNodeSchemaBase = z.object({
  name: SafeNameSchema.openapi({
    title: "Name",
    description:
      "The name of the node. Needs to be unique within the codebook, and only contain alphanumeric characters and underscores.",
    example: "unique_name",
  }),
  parentId: z.number().nullable().openapi({
    title: "The id of another codebook node that is the parent of this node",
    description: "The ID of the parent of this node, or null if it is a root node",
  }),
  position: z.number().openapi({
    title: "Position",
    description: "The position of the node in the list of children of the parent node",
  }),
});

export const CodebookNodeDataTypeSchema = z.object({
  type: z.enum(codebookNodeType).openapi({
    title: "Type",
    description: "The type of the node",
  }),
});

export const CodebookNodeQuestionVariableSchema = CodebookNodeDataTypeSchema.extend({
  type: z.literal("Question task"),
  variable: QuestionVariableSchema,
});

export const CodebookNodeSpanVariableSchema = CodebookNodeDataTypeSchema.extend({
  type: z.literal("Annotation task"),
  variable: SpanVariableSchema,
});

export const CodebookNodeAnnotationPhaseSchema = CodebookNodeDataTypeSchema.extend({
  type: z.literal("Annotation phase"),
  layout: UnitLayoutSchema,
});

export const CodebookNodeSurveyPhaseSchema = CodebookNodeDataTypeSchema.extend({
  type: z.literal("Survey phase"),
});

export const CodebookNodeAnnotationGroupSchema = CodebookNodeDataTypeSchema.extend({
  type: z.literal("Annotation group"),
  layout: UnitLayoutSchema,
});

export const CodebookNodeSurveyGroupSchema = CodebookNodeDataTypeSchema.extend({
  type: z.literal("Survey group"),
});

export const CodebookNodeDataSchema = z.discriminatedUnion("type", [
  CodebookNodeQuestionVariableSchema,
  CodebookNodeSpanVariableSchema,
  CodebookNodeAnnotationPhaseSchema,
  CodebookNodeAnnotationGroupSchema,
  CodebookNodeSurveyPhaseSchema,
  CodebookNodeSurveyGroupSchema,
]);

export const CodebookNodeCreateSchema = CodebookNodeSchemaBase.extend({ data: CodebookNodeDataSchema });

export const CodebookNodeUpdateSchema = CodebookNodeSchemaBase.partial().extend({
  data: CodebookNodeDataSchema.optional(),
});

// DELETE
export const CodebookNodeDeleteSchema = z.object({
  recursive: z.coerce.boolean().optional().openapi({
    title: "Recursive",
    description: "Delete all children nodes. If false, trying to delete a node with children will throw an error",
  }),
});

// RESPONSE

// For this endpoint we process the response from the server client side,
// so the response schema for the server is different from the response schema for the client
export const CodebookNodeResponseSchema = CodebookNodeSchemaBase.extend({
  id: z.number(),
  data: CodebookNodeDataSchema,
});

const TreeUpdateSchema = z.array(
  z.object({
    id: z.number(),
    parentId: z.number().nullable(),
    position: z.number(),
  }),
);

export const CodebookNodeCreateResponseSchema = z.object({
  tree: TreeUpdateSchema,
  node: CodebookNodeResponseSchema,
});

export const CodebookNodeUpdateResponseSchema = z.object({
  tree: TreeUpdateSchema.optional(),
  node: z.object({
    id: z.number(),
    name: z.string().optional(),
    data: CodebookNodeDataSchema.optional(),
  }),
});
