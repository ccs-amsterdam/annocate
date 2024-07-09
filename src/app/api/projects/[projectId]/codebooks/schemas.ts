import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { CodebookVariablesSchema } from "./variablesSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";

extendZodWithOpenApi(z);

export const CodebookSettingsSchema = z.object({
  instruction: z.string().optional().openapi({
    title: "Instruction",
    description:
      "Optionally, you can provide additional instructions for the codebook. This is a markdown string, so you can style it as you like",
    example: "Here we measure emotion, defined as ...",
  }),
  auto_instruction: z.boolean().optional().openapi({
    title: "Automatically open instruction",
    description:
      "If enabled, the instruction is automatically shown to the annotator the first time they encounter this codebook a session.",
    example: true,
  }),
});

///////////////// VARIABLES

export const CodebookSchema = z.object({
  unit: UnitLayoutSchema.openapi({
    title: "Unit",
    description: "Design the units of analysis",
  }),
  variables: CodebookVariablesSchema.openapi({
    title: "Variables",
    description: "The variables that will be shown to the annotator",
  }),
  settings: CodebookSettingsSchema,
});

export const CodebooksTableParamsSchema = createTableParamsSchema({});

export const CodebookNameSchema = z.string().min(0).max(128).openapi({
  title: "Name",
  description: "The name of the codebook",
  example: "My first codebook",
});

export const CodebooksResponseSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  created: z.coerce.date(),
  name: z.string(),
});

export const CodebookResponseSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
  created: z.coerce.date(),
  codebook: CodebookSchema,
});

export const CodebookCreateBodySchema = z.object({
  name: CodebookNameSchema,
  codebook: CodebookSchema,
  overwrite: z.boolean().optional().openapi({
    title: "Overwrite",
    description: "If a codebook with the same name already exists, overwrite it",
    example: true,
  }),
});

export const CodebookCreateResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const CodebookUpdateBodySchema = z.object({
  name: CodebookNameSchema.optional(),
  codebook: CodebookSchema.optional(),
});
