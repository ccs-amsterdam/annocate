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

export const SpanTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("span"),
  field: z.string(),
  offset: z.number(),
  length: z.number(),
});

export const FieldTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("field"),
  field: z.string(),
  id: z.string(),
});

export const UnitTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("unit"),
  id: z.string(),
});

export const RelationTypeAnnotationSchema = GeneralTypeAnnotationSchema.extend({
  type: z.literal("relation"),
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
});

export const AnnotationSchema = z.discriminatedUnion("type", [
  SpanTypeAnnotationSchema,
  FieldTypeAnnotationSchema,
  UnitTypeAnnotationSchema,
  RelationTypeAnnotationSchema,
]);
