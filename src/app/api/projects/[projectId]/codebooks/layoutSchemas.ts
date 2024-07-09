import { z } from "zod";
import { SafeNameSchema, createTableParamsSchema } from "@/app/api/schemaHelpers";
import { FormOptions } from "@/components/Forms/formHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const fieldType = ["text", "image", "markdown"] as const;
export const fieldTypeOptions: FormOptions[] = [
  { value: "text", label: "Text", description: "A plain text. supports token level annotations" },
  { value: "image", label: "Image", description: "A single image." },
  {
    value: "markdown",
    label: "Markdown",
    description: "A markdown document. Most customizable, but doesn't support token level annotation",
  },
];

export const UnitGeneralLayoutSchema = z.object({
  type: z.enum(["text", "markdown", "image", "variable"]).openapi({
    title: "Type",
    description: `The type of the field. Can be text, markdown, image or variable. 
                  The markdown type is most flexible in terms of styling, but markdown 
                  text cannot be annotated (span and relation type variables). 
                  Text and image types support annotations.`,
    example: "markdown",
  }),
  name: SafeNameSchema.openapi({
    title: "Name",
    description: "A unique name for the field",
    example: "field_name",
  }),
  column: z.string().openapi({
    title: "Column",
    description: "The column name in the units data table from which to get the field value.",
    example: "headline, text, image_url, ...",
  }),
  style: z
    .record(z.string(), z.string())
    .optional()
    .openapi({
      title: "Style",
      description: "An object with inline CSS properties",
      example: { fontSize: "1.3em", fontWeight: "bold" },
    }),
});

export const UnitTextLayoutSchema = UnitGeneralLayoutSchema.extend({
  type: z.literal("text"),
  context_before: z.string().optional(),
  context_after: z.string().optional(),
});

export const UnitMarkdownLayoutSchema = UnitGeneralLayoutSchema.extend({
  type: z.literal("markdown"),
});

export const UnitImageLayoutSchema = UnitGeneralLayoutSchema.extend({
  type: z.literal("image"),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const UnitFieldLayoutUnionSchema = z.union([
  UnitTextLayoutSchema,
  UnitMarkdownLayoutSchema,
  UnitImageLayoutSchema,
]);

export const UnitFieldLayoutSchema = z.array(UnitFieldLayoutUnionSchema).refine(
  (fields) => {
    const names = fields.map((v) => v.name);
    return new Set(names).size === names.length;
  },
  { message: "Field names must be unique" },
);

export const UnitLayoutGridSchema = z.object({
  areas: z.array(z.array(z.string())),
  rows: z.array(z.number()).optional(),
  columns: z.array(z.number()).optional(),
});

export const UnitMetaSchema = z.object({
  name: z.string(),
  column: z.string(),
});

export const UnitLayoutSchema = z.object({
  grid: UnitLayoutGridSchema.optional(),
  fields: UnitFieldLayoutSchema,
  meta: z.array(UnitMetaSchema).optional(),
});
