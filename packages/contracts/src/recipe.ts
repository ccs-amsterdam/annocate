import { WrittenDesignFormatSchema } from "./design/format.js";
import { z } from "zod";
import { DraftItemsSchema } from "./design/designVersion.js";
import { PublicInfoSchema, SessionSpecSchema } from "./design/session.js";
import { UnitDataSchema } from "./common.js";
import { StudyNameSchema } from "./study.js";
import { RoleColumnSchema, SetNameSchema } from "./sets.js";
import { UnitsSpecSchema } from "./unitFields.js";
import { CoderEmailSchema, CoderIdSchema } from "./coder.js";

/**
 * A recipe: everything a new study starts with, in one document
 * (docs/examples.md). Example studies are recipes (with example
 * answers), importing a design file makes one, and later templates will be
 * recipes without units. `POST /study/from-recipe` makes a study from it in
 * one transaction; afterwards it is an ordinary study. Its links follow from
 * its design once deployed.
 */
export const RecipeSchema = z.object({
  /** The new study's name. */
  name: StudyNameSchema,
  /** Units: your id, and the fields (the first unit's fields are the study's, as with an upload). */
  units: z.array(z.object({ id: z.string().min(1), data: UnitDataSchema })).default([]),
  /** The expert coders, each with an email address or without: `coder_set` names only these. */
  coders: z.array(z.object({ coder: CoderIdSchema, email: CoderEmailSchema.optional() })).default([]),
  /** The columns with a role (`coder_set`, `test_set`, ...: stored as sets), by the units' ids (a set's units in order; `ordered`: that order was given). */
  sets: z
    .array(
      z.object({
        column: RoleColumnSchema,
        sets: z.array(
          z.object({ name: SetNameSchema, units: z.array(z.string()), ordered: z.boolean().default(false) }),
        ),
      }),
    )
    .default([]),
  /** The first design version: a draft, or deployed with `deploy` (then it must pass validation). */
  design: z.object({
    /** The design format the items are in, as in a design file. Left out: the current one. */
    formatVersion: WrittenDesignFormatSchema,
    note: z.string().max(1000).optional(),
    public: PublicInfoSchema.optional(),
    session: SessionSpecSchema.optional(),
    /**
     * The unit fields, declared (types, descriptions), as in a design file. Fields the units have that aren't
     * declared are added as with an upload; the units' values must fit.
     * Without it, the fields are read from the units.
     */
    units: UnitsSpecSchema.optional(),
    items: DraftItemsSchema,
  }),
  /** Deploy the design, so coders can start right away (examples). Default: a draft. */
  deploy: z.boolean().default(false),
});
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeInput = z.input<typeof RecipeSchema>;
