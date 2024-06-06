import { z } from "zod";
import { UnitDataValueSchema } from "../schemas";
import { TableParamsSchema } from "@/app/api/schemaHelpers";

export const UnitGeneralLayoutSchema = z.object({
  type: z.enum(["text", "markdown", "image", "variable"]),
  name: z.string().min(1).max(128),
  style: z.record(z.string(), z.string()),
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

export const UnitLayoutsTableParamsSchema = TableParamsSchema.extend({});

export const UnitLayoutsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const UnitLayoutResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  layout: UnitLayoutSchema,
});

export const UnitLayoutsCreateBodySchema = z.object({
  name: z.string(),
  layout: UnitLayoutSchema,
  overwrite: z.boolean().optional(),
});

export const UnitLayoutsUpdateBodySchema = z.object({
  name: z.string().optional(),
  layout: UnitLayoutSchema.optional(),
});

export const UnitLayoutsCreateResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});
