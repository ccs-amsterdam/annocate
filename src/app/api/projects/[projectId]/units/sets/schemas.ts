import { z } from "zod";
import { UnitDataValueSchema } from "../schemas";
import { TableParamsSchema } from "@/app/api/schemaHelpers";

export const UnitGeneralLayoutSchema = z.object({
  type: z.enum(["text", "markdown", "image", "variable"]),
  name: z.string().min(1).max(128),
  style: z.record(z.string(), z.string()),
  value: z.string(),
});

export const UnitTextLayoutSchema = UnitGeneralLayoutSchema.extend({
  type: z.literal("text"),
  label: z.string().optional(),
  offset: z.number().optional(),
  unit_start: z.number().optional(),
  unit_end: z.number().optional(),
  context_before: z.string().optional(),
  context_after: z.string().optional(),
  paragraphs: z.boolean().optional(),
});

export const UnitMarkdownLayoutSchema = UnitGeneralLayoutSchema.extend({
  type: z.literal("markdown"),
});

export const UnitImageLayoutSchema = UnitGeneralLayoutSchema.extend({
  type: z.literal("image"),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const UnitLayoutGridSchema = z.object({
  areas: z.array(z.string()),
  rows: z.array(z.number()).optional(),
  columns: z.array(z.number()).optional(),
});

export const UnitLayoutSchema = z.object({
  grid: UnitLayoutGridSchema.optional(),
  fields: z.array(z.union([UnitTextLayoutSchema, UnitMarkdownLayoutSchema, UnitImageLayoutSchema])),
  variables: z.record(z.string(), UnitDataValueSchema),
});

export const UnitSetsTableParamsSchema = TableParamsSchema.extend({});

export const UnitSetsResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.coerce.date(),
  collections: z.array(z.string()),
  layout: UnitLayoutSchema,
});

export const UnitSetsCreateBodySchema = z.object({
  name: z.string(),
  layout: UnitLayoutSchema,
  collections: z.array(z.string()),
  overwrite: z.boolean().optional(),
});

export const UnitSetsUpdateBodySchema = z.object({
  name: z.string().optional(),
  layout: UnitLayoutSchema.optional(),
  collections: z.array(z.string()).optional(),
});

export const UnitSetsCreateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
});
