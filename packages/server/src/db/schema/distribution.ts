import { index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { coderSessions } from "./coders.js";
import { bigId, timestamptz } from "./columns.js";
import { studies } from "./studies.js";
import { units, unitVersions } from "./units.js";

// Distribution (docs/architecture.md): what the runtime needs to hand out
// units across server processes.

/** When a unit was first handed to a coder, and the version they got. */
export const unitServes = pgTable(
  "unit_serves",
  {
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    sessionId: bigId()
      .notNull()
      .references(() => coderSessions.id, { onDelete: "cascade" }),
    unitId: bigId()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    unitVersionId: bigId().references(() => unitVersions.id, { onDelete: "set null" }),
    firstServed: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "unit_serves_pkey", columns: [t.sessionId, t.unitId] }),
    index("unit_serves_unit").on(t.unitId),
    index("unit_serves_unit_version").on(t.unitVersionId),
  ],
);

/** Units of a shared queue handed out to a coder, until they expire. */
export const unitLeases = pgTable(
  "unit_leases",
  {
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    loopKey: text().notNull(),
    setName: text().notNull(),
    sessionId: bigId()
      .notNull()
      .references(() => coderSessions.id, { onDelete: "cascade" }),
    unitId: bigId()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    expires: timestamptz().notNull(),
  },
  (t) => [
    primaryKey({ name: "unit_leases_pkey", columns: [t.studyId, t.loopKey, t.setName, t.sessionId, t.unitId] }),
    index("unit_leases_session").on(t.sessionId),
    index("unit_leases_unit").on(t.unitId),
  ],
);

/** Finished units per loop and coder, with what counts for agreement (shared queues: until coders agree). */
export const unitCodings = pgTable(
  "unit_codings",
  {
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    loopKey: text().notNull(),
    unitId: bigId()
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    sessionId: bigId()
      .notNull()
      .references(() => coderSessions.id, { onDelete: "cascade" }),
    agreement: jsonb().$type<Record<string, string | null>>().notNull().default({}),
    created: timestamptz().notNull().defaultNow(),
    updated: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "unit_codings_pkey", columns: [t.studyId, t.loopKey, t.unitId, t.sessionId] }),
    index("unit_codings_coder").on(t.sessionId, t.loopKey, t.created),
    index("unit_codings_unit").on(t.unitId),
  ],
);
