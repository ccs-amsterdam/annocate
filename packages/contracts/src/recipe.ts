import { z } from "zod";
import { DraftItemsSchema } from "./codebook/codebook.js";
import { SessionSpecSchema } from "./codebook/session.js";
import { UnitDataSchema } from "./common.js";
import { SetGroupNameSchema, SetNameSchema } from "./sets.js";

/**
 * A recipe: everything a new job starts with, in one document
 * (docs/plans/setup-wizard.md). Example jobs are recipes (with example
 * answers), the setup wizard writes one, and later templates will be
 * recipes without units. `POST /job/from-recipe` makes a job from it in
 * one transaction; afterwards it is an ordinary job. Its links follow from
 * its codebook once deployed.
 */
export const RecipeSchema = z.object({
  /** The new job's name. */
  name: z.string().min(1).max(256),
  /** Units: your id, and the fields (the first unit's fields are the job's, as with an upload). */
  units: z.array(z.object({ id: z.string().min(1), data: UnitDataSchema })).default([]),
  /** Set groups, by the units' ids (a set's units in order; `ordered`: that order was given). */
  sets: z
    .array(
      z.object({
        group: SetGroupNameSchema,
        sets: z.array(z.object({ name: SetNameSchema, units: z.array(z.string()), ordered: z.boolean().default(false) })),
      }),
    )
    .default([]),
  /** The first design version: a draft, or deployed with `publish` (then it must pass validation). */
  codebook: z.object({ note: z.string().max(1000).optional(), items: DraftItemsSchema, session: SessionSpecSchema.optional() }),
  /** Deploy the codebook, so coders can start right away (examples). Default: a draft. */
  publish: z.boolean().default(false),
});
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeInput = z.input<typeof RecipeSchema>;
