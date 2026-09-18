import { SafeNameSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export const VariableIdSchema = z.number().int().positive();

export const GeneralAnnotationSchema = z.object({
  id: z.string(),
  variableId: VariableIdSchema,

  created: z.coerce.date(),
  deleted: z.coerce.date().optional(),

  code: z.string().optional(),
  value: z.number().optional(),

  // TODO: let server return a hash of each possible annotation (e.g. type+code+value),
  // and include this in the annotation. Server can then quickly validate whether
  // the submitted value is valid. Also need this on 'submit' type, and for 'skip'
  // type we can validate that variable can only be skipped if there is a possible branching
  // that excludes it (though we won't validate all branch combinations)
  hash: z.string().optional(),

  // TODO: standardize this so that SpanAnnotation also uses this. There should be no difference between
  // a question and span annotation in this regard. Questions should also be able to make annotations with a span (question about annotation or text match).
  // Questions should even be able to make relations (e.g. question about two annotations)

  context: z
    .object({
      field: z.string(),
      span: z.array(z.number()).optional(),
    })
    .optional(),

  client: z.object({
    color: z.string().optional(),
    positions: z.set(z.number()).optional(),
    text: z.string().optional(),
  }),
});

export const QuestionAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("question"),
  item: z.string().optional(),
});

export const SpanAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("span"),
  field: z.string(),
  offset: z.number(),
  length: z.number(),
  span: z.array(z.number()), // this could be optional since its automatically omputed from offset and length. Ideally eventualy just one is required, but dont fix this until offset/length has been changed to allow gaps

  // We should make two position properties: char_span and token_span. Both look like: 2-3, 6-9
});

export const RelationAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("relation"),
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
});

export const AnnotationSchema = z.discriminatedUnion("type", [
  QuestionAnnotationSchema,
  SpanAnnotationSchema,
  RelationAnnotationSchema,
]);

export const VariableAnnotationsSchema = z.object({
  annotations: z.array(AnnotationSchema),
  done: z.boolean(),
  skip: z.boolean(),
});
