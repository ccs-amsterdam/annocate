import { z } from "zod";

export interface GeneralTypeAnnotation {
  id: string;
  variable: string;
  code: string | undefined;
  value: number | undefined;

  created: string;

  color?: string;
  comment?: string;

  time_question?: string;
  time_answer?: string;

  // intermediate values (not stored in backend)
  index?: number;
  text?: string;
  positions?: Set<number>;
  span?: [number, number];

  select?: () => void;
}

export interface SpanTypeAnnotation extends GeneralTypeAnnotation {
  type: "span";
  field: string;
  offset: number;
  length: number;
}

export interface FieldTypeAnnotation extends GeneralTypeAnnotation {
  type: "field";
  field: string;
  id: string;
}

export interface UnitTypeAnnotation extends GeneralTypeAnnotation {
  type: "unit";
  id: string;
}

export interface RelationTypeAnnotation extends GeneralTypeAnnotation {
  type: "relation";
  id: string;
  fromId: string;
  toId: string;
}

export type Annotation = SpanTypeAnnotation | FieldTypeAnnotation | UnitTypeAnnotation | RelationTypeAnnotation;

export const GeneralTypeAnnotationSchema = z.object({
  id: z.string(),
  variable: z.string(),
  code: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),

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

export const AnnotationSchema = z.union([
  SpanTypeAnnotationSchema,
  FieldTypeAnnotationSchema,
  UnitTypeAnnotationSchema,
  RelationTypeAnnotationSchema,
]);
