import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { FormOptions } from "@/components/Forms/formHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JobsTableParamsSchema = createTableParamsSchema({});

export const distributionMode = ["fixed", "expert", "crowd"] as const;
export const distributionModeOptions: FormOptions[] = [
  {
    value: "fixed",
    label: "Fixed",
    description: "Every annotator gets the same units, either in the specified order or randomized",
  },
  {
    value: "expert",
    label: "Expert",
    description: "Every unit is assigned to a single annotator (except for overlap units)",
  },
  { value: "crowd", label: "Crowd", description: "Units are assigned to multiple annotators" },
];

export const JobRulesSchema = z.object({
  mode: z.enum(distributionMode).nullish().openapi({
    title: "Distribution mode",
    description:
      "Fixed: Every annotator gets the same units, either in the specified order or randomized. Expert: Every unit is assigned to a single annotator (except for overlap units). Crowd: Units are assigned to multiple annotators",
  }),
  maxUnitsPerCoder: z.number().int().min(1).nullish().openapi({
    title: "Max units per coder",
    description: "In expert and crowd mode, the maximum number of units assigned per coder",
  }),
  maxCodersPerUnit: z.number().int().min(1).nullish().openapi({
    title: "Max coders per unit",
    description: "In crowd mode, the maximum number of coders that a unit will be assigned to",
  }),
  overlapUnits: z.number().int().nullish().openapi({
    title: "Overlap units",
    description:
      "In expert and crowd mode, overlap units are assigned to every annotator. The typical use case is to calculate intercoder reliability",
  }),
  // overlapPosition: z.enum(["random", "start", "end"]).nullish().openapi({
  //   title: "Overlap position",
  //   description: "Where to insert the overlap units",
  // }),
  randomizeUnits: z
    .boolean()
    .nullish()
    .openapi({ title: "Randomize units", description: "Randomize the order of units for every coder" }),
});

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

export const JobMetaResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  modified: z.coerce.date(),
  deployed: z.boolean(),
});

export const JobResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  modified: z.coerce.date(),
  deployed: z.boolean(),
});

export const JobSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  unitIds: z.array(z.number()),
});

export const JobSetResponseSchema = z.array(JobSetSchema);
