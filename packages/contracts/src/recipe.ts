import { z } from "zod";
import { DraftItemsSchema } from "./codebook/codebook.js";
import { CoderInviteWriteSchema } from "./coder.js";
import { UnitDataSchema } from "./common.js";
import { UnitsetWriteSchema } from "./unitset.js";

/**
 * A recipe: everything a new job starts with, in one document
 * (docs/plans/setup-wizard.md). Example jobs are recipes (with example
 * answers), the setup wizard writes one, and later templates will be
 * recipes without units. `POST /job/from-recipe` makes a job from it in
 * one transaction; afterwards it is an ordinary job.
 */
export const RecipeSchema = z.object({
  /** The new job's name. */
  name: z.string().min(1).max(256),
  /** Units: your id, and the fields (the first unit's fields are the job's, as with an upload). */
  units: z.array(z.object({ id: z.string().min(1), data: UnitDataSchema })).default([]),
  /** Unitsets, by the units' ids. */
  unitsets: z.array(z.object({ name: UnitsetWriteSchema.shape.name, units: z.array(z.string()) })).default([]),
  /** The first codebook version: a draft, or published with `publish` (then it must pass validation). */
  codebook: z.object({ note: z.string().max(1000).optional(), items: DraftItemsSchema }),
  /** Publish the codebook, so coders can start right away (examples). Default: a draft. */
  publish: z.boolean().default(false),
  /** Invitations; `unitset` names one of the recipe's unitsets (invitation mode). */
  invites: z.array(CoderInviteWriteSchema.omit({ unitsetId: true }).extend({ unitset: z.string().optional() })).default([]),
});
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeInput = z.input<typeof RecipeSchema>;
