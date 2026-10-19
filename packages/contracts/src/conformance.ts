import { z } from "zod";
import { UnitDataSchema } from "./common.js";
import { CodebookWriteSchema } from "./codebook/codebook.js";
import { CoderInviteWriteSchema } from "./coder.js";

/**
 * The data a db server loads to be checked by the conformance suite
 * (`packages/conformance`): one deployed job. Plain JSON, so a db server in
 * any language can load it; ids are assigned by the db server, and the
 * suite finds them through the annotator API (unitsets, `externalId`).
 */
export const ConformanceFixtureSchema = z.object({
  job: z.object({ name: z.string() }),
  /** Deployed as version 1. */
  codebook: CodebookWriteSchema,
  units: z.array(z.object({ externalId: z.string(), data: UnitDataSchema })),
  /** Unitsets by unit `externalId`, in order. */
  unitsets: z.array(z.object({ name: z.string(), externalIds: z.array(z.string()) })),
  /** Invites with a known `secret`, so the suite can create coders. */
  invites: z.array(CoderInviteWriteSchema.extend({ secret: z.string().min(1) })),
});
export type ConformanceFixture = z.infer<typeof ConformanceFixtureSchema>;
