import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JobsTableParamsSchema = createTableParamsSchema({});

export const JobBlockBaseSchema = z.object({
  type: z
    .enum(["survey", "annotation"])
    .openapi({ title: "Block type", description: "A job can have blocks for surveys and annotation tasks" }),
  position: z.number().openapi({ title: "Block position", description: "Position of the block in the job" }),
  name: z.string().max(255).nullable().openapi({
    title: "Block name",
    description: "Optional name of the block.",
  }),
  codebookId: z.number().openapi({
    title: "Codebook ID",
    description:
      "Every block is tied to a specific codebook. Survey blocks require a 'survey' type codebook, that describes the survey variables. Annotation blocks require an 'annotation' type codebook that describes what questions to ask for each unit in the block, and also how the units are to be displayed",
  }),
});

export const JobSurveyBlockSchema = JobBlockBaseSchema.extend({
  type: z.literal("survey"),
});

export const JobAnnotationBlockRulesSchema = z.object({
  maxUnitsPerCoder: z
    .number()
    .int()
    .min(1)
    .nullish()
    .openapi({ title: "Max units per coder", description: "The maximum number of units assigned per coder" }),
  maxCodersPerUnit: z.number().int().min(1).nullish().openapi({
    title: "Max coders per unit",
    description: "The maximum number of coders that a unit will be assigned to",
  }),
  overlapUnits: z.number().int().min(1).nullish().openapi({
    title: "Overlap units",
    description:
      "Draws a random selection of units that will be assigned to all coders. The typical use case is to calculate intercoder reliability",
  }),
  randomizeUnits: z
    .boolean()
    .nullish()
    .openapi({ title: "Randomize units", description: "Randomize the order of units for every coder" }),
});

export const JobAnnotationBlockSchema = JobBlockBaseSchema.extend({
  type: z.literal("annotation"),
  units: z.array(z.string()).max(10000).openapi({
    title: "Unit selection",
    description:
      "Optionally, provide a list of unit IDs (max 10000) to use for this block. If left empty, all units will be used. Using specific units let's you control the order in which coders see them (if randomization is off), and ensures that the job is not affected if new units are added to the project.",
  }),
  rules: JobAnnotationBlockRulesSchema,
});

export const JobBlockSchema = z.union([JobSurveyBlockSchema, JobAnnotationBlockSchema]);

// current idea is that jobs have blocks.
// each block has a codebook, which can be a survey or annotation type.
// annotation blocks furthermore have units, and rules for how to select units.
// add 'preview' at block level.
// and at codebook level.

export const JobCreateSchema = z.object({
  name: z.string(),
});

export const JobUpdateSchema = z.object({
  name: z.string(),
});

export const JobBlockCreateSchema = z.union([JobSurveyBlockSchema, JobAnnotationBlockSchema]);
export const JobBlockUpdateSchema = z.union([JobSurveyBlockSchema.partial(), JobAnnotationBlockSchema.partial()]);

export const JobMetaResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  modified: z.coerce.date(),
  deployed: z.boolean(),
  // blocks: z.array(JobBlockSchema),
});

export const JobBlockMetaSchema = z.object({
  id: z.number(),
  type: z.enum(["survey", "annotation"]),
  name: z.string().nullable(),
  position: z.number(),
  codebookId: z.number(),
  codebookName: z.string(),
  rules: JobAnnotationBlockRulesSchema,
  nVariables: z.number(),
  nUnits: z.number(),
});

export const JobBlockResponseSchema = z.object({
  id: z.number(),
  type: z.enum(["survey", "annotation"]),
  name: z.string().nullable(),
  position: z.number(),
  codebookId: z.number(),
  codebookName: z.string(),
  rules: JobAnnotationBlockRulesSchema,
  units: z.array(z.string()),
});

export const JobResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  modified: z.coerce.date(),
  deployed: z.boolean(),
  blocks: z.array(JobBlockMetaSchema),
});
