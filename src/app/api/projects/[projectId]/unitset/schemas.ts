import { z } from "zod";

export const UnitDataColumnSchema = z.object({
  name: z.string().min(1).max(128),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const UnitDataRowSchema = z.object({
  id: z.string(),
  columns: z.array(UnitDataColumnSchema),
});

export const UnitGeneralPresentationSchema = z.object({
  type: z.enum(["text", "markdown", "image", "variable"]),
  name: z.string().min(1).max(128),
  style: z.record(z.string(), z.string()),
  value: z.string(),
});

export const UnitTextPresentationSchema = UnitGeneralPresentationSchema.extend({
  type: z.literal("text"),
  label: z.string().optional(),
  offset: z.number().optional(),
  unit_start: z.number().optional(),
  unit_end: z.number().optional(),
  context_before: z.string().optional(),
  context_after: z.string().optional(),
  paragraphs: z.boolean().optional(),
});

export const UnitMarkdownPresentationSchema = UnitGeneralPresentationSchema.extend({
  type: z.literal("markdown"),
});

export const UnitImagePresentationSchema = UnitGeneralPresentationSchema.extend({
  type: z.literal("image"),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const UnitPresentationGridSchema = z.object({
  areas: z.array(z.string()),
  rows: z.array(z.number()).optional(),
  columns: z.array(z.number()).optional(),
});

export const UnitPresentationSchema = z.object({
  id: z.string(),
  grid: UnitPresentationGridSchema.optional(),
  fields: z.array(z.union([UnitTextPresentationSchema, UnitMarkdownPresentationSchema, UnitImagePresentationSchema])),
});


