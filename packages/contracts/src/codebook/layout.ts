import { z } from "zod";
import { SafeNameSchema } from "../common.js";

// Ported from old/src/app/api/.../codebookNodes/layoutSchemas.ts. Describes
// how a unit's fields (columns in the unit data) are rendered on screen.
// Attached to a `unit_loop` codebook item (design plan §2).

const BaseFieldSchema = z.object({
  name: SafeNameSchema.describe("A unique name for the field"),
  example: z.string().optional().describe("An example value, used in job previews"),
  style: z.record(z.string(), z.string()).optional(),
});

export const TextFieldSchema = BaseFieldSchema.extend({
  type: z.literal("text"),
  column: z.string().describe("The unit data column to render"),
  context_before: z.string().optional(),
  context_after: z.string().optional(),
});

export const MarkdownFieldSchema = BaseFieldSchema.extend({
  type: z.literal("markdown"),
  template: z.string().describe("A markdown template, can reference unit data columns, e.g. '# {{headline}}'"),
});

export const ImageFieldSchema = BaseFieldSchema.extend({
  type: z.literal("image"),
  column: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const UnitFieldSchema = z.discriminatedUnion("type", [TextFieldSchema, MarkdownFieldSchema, ImageFieldSchema]);
export type UnitField = z.infer<typeof UnitFieldSchema>;

export const UnitFieldsSchema = z
  .array(UnitFieldSchema)
  .refine((fields) => new Set(fields.map((f) => f.name)).size === fields.length, {
    message: "Field names must be unique",
  });

export const UnitLayoutGridSchema = z.object({
  areas: z.array(z.array(z.string())),
  rows: z.array(z.number()).optional(),
  columns: z.array(z.number()).optional(),
});

/** A non-rendered "meta" field, e.g. a source link shown alongside the unit but not part of the layout grid. */
export const UnitLayoutMetaFieldSchema = z.object({
  name: z.string(),
  column: z.string(),
});

export const UnitLayoutSchema = z.object({
  grid: UnitLayoutGridSchema.optional(),
  fields: UnitFieldsSchema,
  meta: z.array(UnitLayoutMetaFieldSchema).optional(),
});
export type UnitLayout = z.infer<typeof UnitLayoutSchema>;
