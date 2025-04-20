import { SafeNameSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export const GeneralAnnotationSchema = z.object({
  id: z.string(),
  variable: SafeNameSchema,
  variableId: z.number(),
  code: z.string().optional(),
  value: z.number().optional(),

  created: z.coerce.date(),
  deleted: z.coerce.date().optional(),
  finishVariable: z.boolean().optional(), // marks whether this annotation finishes the variable

  // TODO: let server return a hash of each possible annotation (e.g. type+code+value),
  // and include this in the annotation. Server can then quickly validate whether
  // the submitted value is valid. Also need this on 'submit' type, and for 'skip'
  // type we can validate that variable can only be skipped if there is a possible branching
  // that excludes it (though we won't validate all branch combinations)
  hash: z.string().optional(),

  client: z.object({
    color: z.string().optional(),
  }),
});

export const QuestionAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("question"),
  item: z.string(),
  context: z.object({
    fields: z.array(z.string()).optional(),
    annotationIds: z.array(z.string()).optional(),
  }),
});

export const SpanAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("span"),
  field: z.string(),
  offset: z.number(),
  length: z.number(),
  span: z.array(z.number()), // this could be optional since its automatically omputed from offset and length. Ideally eventualy just one is required, but dont fix this until offset/length has been changed to allow gaps

  positions: z.array(z.number()).optional(),
  text: z.array(z.number()).optional(),
  // We should make two position properties: char_span and token_span. Both look like: 2-3, 6-9
});

export const RelationAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("relation"),
  id: z.string(),
  fromId: z.string(),
  toId: z.string(),
});

// at some point move some properties like code and value so  that they are not
// included in the followign special types. This just requires adding some typeguards
export const SubmitAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("submit"),
});
export const SkipAnnotationSchema = GeneralAnnotationSchema.extend({
  type: z.literal("skip"),
  skip: z.boolean(),
});

export const AnnotationSchema = z.discriminatedUnion("type", [
  QuestionAnnotationSchema,
  SpanAnnotationSchema,
  RelationAnnotationSchema,
  SubmitAnnotationSchema,
  SkipAnnotationSchema,
]);
