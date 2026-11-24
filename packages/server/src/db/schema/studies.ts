import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { DEFAULT_REOPEN_MINUTES, type DeploymentChanges } from "@annotinder/contracts";
import { users } from "./accounts.js";
import { bigId, timestamptz } from "./columns.js";

// Studies: the design, its deployments, links. Almost everything belongs to
// one study and goes with it (ON DELETE CASCADE).

/**
 * A study. owner_id: who created it (counts against their plan); origin: an
 * example or recipe it came from; reopen_minutes: how long coders can go
 * back after finishing (null: always, the session stays open); redirect_urls: panel return links by
 * setting name; suspended_at: blocked by an admin.
 */
export const studies = pgTable("studies", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  ownerId: integer().references(() => users.id, { onDelete: "set null" }),
  origin: text(),
  archived: boolean().notNull().default(false),
  reopenMinutes: integer().default(DEFAULT_REOPEN_MINUTES),
  redirectUrls: jsonb().$type<Record<string, string>>().notNull().default({}),
  created: timestamptz().notNull().defaultNow(),
  suspendedAt: timestamptz(),
});

/**
 * Design versions: the questions and their order (items), the session
 * settings, the declared unit fields (units), and the public part coders
 * see (public). Drafts are saved freely (revision: bumped on every save, for
 * conflicts); a deployed version becomes immutable: answers refer to it.
 */
export const designVersions = pgTable(
  "design_versions",
  {
    id: bigId().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    note: text(),
    // The design format the items are in (contracts DESIGN_FORMAT_VERSION)
    formatVersion: integer().notNull().default(1),
    // As stored; read through shared/designVersions.ts
    items: jsonb().$type<unknown>().notNull(),
    session: jsonb().$type<unknown>().notNull().default({}),
    units: jsonb().$type<unknown>().notNull().default({ fields: [] }),
    immutable: boolean().notNull().default(false),
    revision: integer().notNull().default(1),
    created: timestamptz().notNull().defaultNow(),
    updated: timestamptz().notNull().defaultNow(),
    updatedBy: text(),
    public: jsonb().$type<unknown>(),
  },
  (t) => [index("design_versions_study").on(t.studyId)],
);

/**
 * A study's deployment: the design version coders get now (at most one per
 * study). version: bumped per deploy (unit versions name deploys by it);
 * annotation_epoch: bumped when answers are reset; revision: bumped on any
 * change coders' sessions must notice; codings_basis: what the stored
 * codings (unit_codings) were counted under; new_units_message: what
 * returning coders who got new units are told (null: nothing).
 */
export const deployments = pgTable("deployments", {
  studyId: integer()
    .primaryKey()
    .references(() => studies.id, { onDelete: "cascade" }),
  designVersionId: bigId()
    .notNull()
    .references(() => designVersions.id),
  version: integer().notNull(),
  active: boolean().notNull().default(true),
  annotationEpoch: integer().notNull().default(0),
  revision: integer().notNull().default(0),
  codingsBasis: text(),
  newUnitsMessage: text(),
  updated: timestamptz().notNull(),
});

/** Each deploy: its design version, what it changed, and the client (release and commit) it ran on. */
export const deploymentVersions = pgTable(
  "deployment_versions",
  {
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    designVersionId: bigId()
      .notNull()
      .references(() => designVersions.id),
    changes: jsonb().$type<DeploymentChanges>().notNull(),
    clientRelease: text().notNull(),
    clientCommit: text().notNull(),
    created: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "deployment_versions_pkey", columns: [t.studyId, t.version] })],
);

/**
 * Links: how coders join a study (docs/coder-identity.md). Made from the
 * design's coder unit assignment (params: the coder of a link per coder;
 * link_key: which link, as JSON), so a deploy keeps, adds and retires them.
 * uses: the sessions it started (a crowd's most coders, per link).
 */
export const links = pgTable(
  "links",
  {
    id: bigId().primaryKey().generatedAlwaysAsIdentity(),
    studyId: integer()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    label: text().notNull(),
    secret: text().notNull().unique("links_secret_key"),
    params: jsonb().$type<Record<string, string>>().notNull().default({}),
    linkKey: text().notNull().default("[]"),
    uses: integer().notNull().default(0),
    created: timestamptz().notNull().defaultNow(),
    revokedAt: timestamptz(),
    retiredAt: timestamptz(),
  },
  (t) => [index("links_study_key").on(t.studyId, t.linkKey)],
);
