import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { AnswerTiming, DeletionRequest, SessionEnd, VariableValue } from "@annotinder/contracts";
import type { CoderAssignments } from "../../runtime/types.js";
import { timestamptz } from "./columns.js";
import { designVersions, links, studies } from "./studies.js";
import { units, unitVersions } from "./units.js";

// Coders and their answers.

/**
 * Coders: one per session of a study (docs/coder-identity.md). link_id: the
 * link they came with; session: its values (parameters, conditions);
 * assignments: the loops they reached; ended: how the session ended;
 * deletion_request: they asked for their answers to be deleted.
 */
export const coderSessions = pgTable(
  "coder_sessions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    linkId: integer().references(() => links.id),
    email: text(),
    coder: text(),
    session: jsonb().$type<Record<string, string>>().notNull().default({}),
    assignments: jsonb().$type<CoderAssignments>().notNull().default({}),
    created: timestamptz().notNull().defaultNow(),
    ended: jsonb().$type<SessionEnd>(),
    deletionRequest: jsonb().$type<DeletionRequest>(),
  },
  (t) => [
    index("coder_sessions_email").on(t.studyId, sql`lower(${t.email})`),
    index("coder_sessions_coder").on(t.studyId, t.coder),
  ],
);

/** A coder's devices (a cookie; key_hash: its hash), with coarse details. */
export const sessionDevices = pgTable(
  "session_devices",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    sessionId: integer()
      .notNull()
      .references(() => coderSessions.id, { onDelete: "cascade" }),
    keyHash: text().notNull().unique("session_devices_key_hash_key"),
    deviceType: text(),
    browser: text(),
    os: text(),
    created: timestamptz().notNull().defaultNow(),
  },
  (t) => [index("session_devices_session").on(t.sessionId)],
);

/**
 * Coders whose data was deleted: the ids downloaded results use, and when
 * (no foreign key to the coder: it is gone). Not their email address: a
 * deletion leaves nothing that identifies the person.
 */
export const sessionDeletions = pgTable(
  "session_deletions",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    sessionId: integer().notNull(),
    coder: text(),
    requestedAt: timestamptz(),
    deletedAt: timestamptz().notNull().defaultNow(),
    deletedBy: text(),
    answers: integer().notNull(),
  },
  (t) => [index("session_deletions_study").on(t.studyId, t.deletedAt)],
);

/** Continuing a session on another device: a short-lived token (stored as a hash). */
export const transfers = pgTable("transfers", {
  tokenHash: text().primaryKey(),
  studyId: integer()
    .notNull()
    .references(() => studies.id, { onDelete: "cascade" }),
  sessionId: integer()
    .notNull()
    .references(() => coderSessions.id, { onDelete: "cascade" }),
  coder: text(),
  expires: timestamptz().notNull(),
});

/**
 * Answers: one row per (unit, coder, question); unit_id NULL: a coder-level
 * answer (outside unit loops). Reset answers are retired (retired_at), never
 * deleted; only live rows count, and only those are unique. With the design
 * version and unit version the coder answered under, the device, the
 * browser's timing; assigned: set by the server (computed variables);
 * frozen: units were coded with it, so it can't change.
 */
export const annotationValues = pgTable(
  "annotation_values",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    sessionId: integer()
      .notNull()
      .references(() => coderSessions.id, { onDelete: "cascade" }),
    unitId: integer().references(() => units.id),
    unitVersionId: integer().references(() => unitVersions.id),
    designVersionId: integer().references(() => designVersions.id),
    deviceId: integer().references(() => sessionDevices.id, { onDelete: "set null" }),
    variable: text().notNull(),
    value: jsonb().$type<VariableValue>().notNull(),
    timing: jsonb().$type<AnswerTiming>(),
    assigned: boolean().notNull().default(false),
    frozen: boolean().notNull().default(false),
    created: timestamptz().notNull(),
    updated: timestamptz().notNull(),
    retiredAt: timestamptz(),
  },
  (t) => [
    index("annotation_values_coder").on(t.studyId, t.sessionId, t.unitId),
    index("annotation_values_created").on(t.studyId, t.created),
    index("annotation_values_variable").on(t.studyId, t.variable),
    uniqueIndex("annotation_values_live")
      .on(t.unitId, t.sessionId, t.variable)
      .where(sql`${t.retiredAt} IS NULL`),
    uniqueIndex("annotation_values_coder_live")
      .on(t.sessionId, t.variable)
      .where(sql`${t.retiredAt} IS NULL AND ${t.unitId} IS NULL`),
  ],
);
