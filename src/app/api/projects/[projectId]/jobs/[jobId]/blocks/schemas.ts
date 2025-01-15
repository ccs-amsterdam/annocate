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
export const CodebookUpdateSchema = z.object({
  codebook: CodebookSchema,
});

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

export const JobBlockSchema = z.object({
  name: z.string().openapi({
    title: "Block name",
    description: "A short for yourself to remember what this block is about",
  }),
  phase: z.enum(["preSurvey", "annotate", "postSurvey"]).openapi({
    title: "Job phase",
    description: "A job can have multiple phases. Pre-survey, annotation, and post-survey",
  }),
  position: z.number().openapi({ title: "Block position", description: "Position of the block in the job" }),
  codebook: CodebookSchema,
});

export const JobBlockCreateSchema = JobBlockSchema;
export const JobBlockUpdateSchema = JobBlockSchema.partial();

export const JobBlockResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  phase: z.enum(["preSurvey", "annotate", "postSurvey"]),
  position: z.number(),
  codebook: CodebookSchema,
});
