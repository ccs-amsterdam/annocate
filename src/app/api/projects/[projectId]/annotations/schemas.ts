import { z } from "zod";

export const VariableStatusSchema = z.enum(["pending", "done", "skip"]);

export const GeneralTypeAnnotationSchema = z.object({
  id: z.string(),
  variable: z.string(),
  code: z.string().optional(),
  value: z.number().optional(),
  status: VariableStatusSchema,

  created: z.string(),
});

export const QuestionTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("question"),
  context: z.object({
    fields: z.array(z.string()).optional(),
    annotationIds: z.array(z.string()).optional(),
  }),
});

export const SpanTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("span"),
  field: z.string(),
  offset: z.number(),
  length: z.number(),
  span: z.array(z.number()),
});

export const RelationTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("relation"),
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
});

export const AnnotationSchema = z.discriminatedUnion("type", [
  QuestionTypeAnnotationSchema,
  SpanTypeAnnotationSchema,
  RelationTypeAnnotationSchema,
]);
