import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { CodebookVariablesSchema } from "./variablesSchemas";
import { UnitLayoutSchema } from "./layoutSchemas";

extendZodWithOpenApi(z);

export const CodebookSettingsSchema = z.object({
  instruction: z
    .string()
    .optional()
    .openapi({
      title: "Instruction",
      description: `Codebooks can contain general instructions for the annotator. These will be shown the first time the annotator sees the codebook in a session,
       and can be opened again by clicking the instruction button.`,
      example: "Here we measure emotion, defined as ...",
    }),
});

export const CodebookBaseSchema = z.object({
  type: z.enum(["survey", "annotation"]),
  variables: CodebookVariablesSchema.openapi({
    title: "Variables",
    description: "The variables that will be shown to the annotator",
  }),
  settings: CodebookSettingsSchema,
});

export const CodebookSurveySchema = CodebookBaseSchema.extend({
  type: z.literal("survey"),
});

export const CodebookAnnotationSchema = CodebookBaseSchema.extend({
  type: z.literal("annotation"),
  unit: UnitLayoutSchema.openapi({
    title: "Unit",
    description: "Design the units of analysis",
  }),
});

export const CodebookSchema = z.union([CodebookSurveySchema, CodebookAnnotationSchema]);

//////////////////////////////////////////////////////////

export const CodebooksTableParamsSchema = createTableParamsSchema({
  add: {
    type: z.enum(["survey", "annotation"]).optional().openapi({
      title: "Type",
      description: "Filter by codebook type",
      example: "survey",
    }),
  },
});

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
  type: z.enum(["survey", "annotation"]),
});

export const CodebookResponseSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  name: z.string(),
  created: z.coerce.date(),
  codebook: CodebookSchema,
  nJobs: z.number(),
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
