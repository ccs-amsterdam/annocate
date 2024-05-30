import { config } from "dotenv";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import {
  boolean,
  primaryKey,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  unique,
  index,
  uuid,
} from "drizzle-orm/pg-core";

import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { NeonHttpDatabase, drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { PostgresJsDatabase, drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import {
  Annotation,
  AnnotationHistory,
  RawCodeBook,
  RawUnit,
  Rules,
  UserRole,
  ServerUnitStatus,
  JobRole,
} from "@/app/types";
import { CodebookSchema } from "@/app/api/jobs/[jobId]/codebook/schemas";
import { z } from "zod";

config({ path: ".env.local" });

// JOB TABLES

export const users = pgTable("users", {
  id: uuid("uuid").primaryKey().defaultRandom(),
  email: varchar("email", { length: 256 }).unique().notNull(),
  created: timestamp("created").notNull().defaultNow(),
  deactivated: boolean("deactivated").notNull().default(false),
  role: text("role", { enum: ["admin", "creator", "guest"] })
    .notNull()
    .$type<UserRole>()
    .default("guest"),
});

export interface JobConfig {
  description: string;
}

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    creator: varchar("creator_email", { length: 256 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    config: jsonb("job").notNull().$type<JobConfig>().default({ description: "" }),
    frozen: boolean("frozen").notNull().default(false),
  },
  (table) => {
    return { unq: unique("unique_creator_name").on(table.creator, table.name) };
  },
);

type Codebook = z.input<typeof CodebookSchema>;

export const codebooks = pgTable(
  "codebooks",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    codebook: jsonb("codebook").notNull().$type<Codebook>(),
  },
  (table) => {
    return {
      jobIds: index("codebook_job_ids").on(table.jobId),
      unq: unique("unique_job_name").on(table.jobId, table.name),
    };
  },
);

export const unitGroups = pgTable(
  "unit_groups",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
  },
  (table) => {
    return { jobIds: index("unitgroups_job_ids").on(table.jobId) };
  },
);

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    unitGroupId: integer("unit_group_id")
      .notNull()
      .references(() => unitGroups.id, { onDelete: "cascade" }),
    externalId: varchar("unit_id", { length: 256 }).notNull(),
    unit: jsonb("unit").notNull().$type<RawUnit>(),
    created: timestamp("created").notNull().defaultNow(),
    codebookId: integer("codebook_id"),
    modified: timestamp("modified").notNull().defaultNow(),
    type: text("type", { enum: ["annotate", "train", "test", "survey"] }).notNull(),
  },
  (table) => {
    return { jobIds: index("units_job_ids").on(table.jobId) };
  },
);

export const jobSets = pgTable(
  "job_sets",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    modified: timestamp("modified").notNull().defaultNow(),
    deployed: boolean("deployed").notNull().default(false),
  },
  (table) => {
    return { jobIds: index("jobsets_job_ids").on(table.jobId) };
  },
);

export const jobSetUnitGroups = pgTable(
  "job_set_unit_groups",
  {
    jobSetId: integer("job_set_id")
      .notNull()
      .references(() => jobSets.id, { onDelete: "cascade" }),
    unitGroupId: integer("unit_group_id")
      .notNull()
      .references(() => unitGroups.id, { onDelete: "cascade" }),
    rules: jsonb("rules").notNull().$type<Rules>(),
    codebookId: integer("codebook_id").references(() => codebooks.id, { onDelete: "set null" }),
  },
  (table) => {
    return { pk: primaryKey({ columns: [table.jobSetId, table.unitGroupId] }) };
  },
);

export const managers = pgTable(
  "managers",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_uuid")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "manager"] })
      .notNull()
      .$type<JobRole>()
      .default("manager"),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.jobId, table.userId] }),
      userIdIndex: index("managers_userId_index").on(table.userId),
    };
  },
);

export const invitations = pgTable(
  "invitations",
  {
    jobSetId: integer("jobset_id")
      .notNull()
      .references(() => jobSets.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 64 }),
    label: varchar("label", { length: 64 }).notNull(),
    access: text("access", { enum: ["only_authenticated", "only_anonymous", "user_decides"] }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.jobSetId, table.id] }),
    };
  },
);

interface jobsetAnnotatorStatistics {
  damage?: number;
  blocked?: boolean;
}

export const jobsetAnnotator = pgTable(
  "jobset_annotator",
  {
    // user is either an email address, a string from the user_id url parameter, or a random device_id.
    user: varchar("user_id", { length: 256 }).notNull(),
    jobSetId: integer("jobset_id"),
    email: varchar("email", { length: 256 }), // this is the authenticated email address
    urlParams: jsonb("url_params").notNull().$type<Record<string, string>>().default({}),
    statistics: jsonb("statistics").notNull().$type<jobsetAnnotatorStatistics>().default({}),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.user, table.jobSetId] }),
    };
  },
);

// routine:
// - check annotations for index
// - if doesn't exist, complete following steps to allocate new units
// - get jobsetunitgroups
// - separately get units of each group, using rules to determine which to get
// - negative join on anntoations to skip already annotated units
// - concatenate units in these groups (maybe directly using union?)
// - preallocate annotations so that already coded annotations keep their index,
//   and new annotations are allocated at the end

export const annotations = pgTable(
  "annotations",
  {
    jobSetId: integer("jobset_id").notNull(),
    // user string depends on type of user
    // - for registered users, it's the email address
    // - for invitations that include u_* params, it's the param string
    // - for invitations without user_id, it's the device_id
    user: varchar("user_id", { length: 256 }).notNull(),
    index: integer("index").notNull(),
    unitId: integer("unit_id").notNull(),

    preallocateTime: timestamp("preallocate_time"),
    annotation: jsonb("annotation").notNull().$type<Annotation[]>(),
    history: jsonb("history").notNull().$type<AnnotationHistory[]>(),
    status: text("status", { enum: ["DONE", "IN_PROGRESS", "PREALLOCATED"] })
      .$type<ServerUnitStatus>()
      .default("PREALLOCATED"),

    // We register the device id for cases where we want extra privacy security.
    // We store a random device ID in an httponly cookie.
    // If the user is not authenticated, and the device id doesnt exist or match, then
    // all annotations that were made (with a different device) will be invisible and
    // immutable. This way, if a user changes devices, they can still continue with the job,
    // but if their login links somehow leaks, it doesn't expose their annotations
    deviceId: varchar("device_id", { length: 64 }),
    authenticated: boolean("authenticated").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.jobSetId, table.user, table.index] }),
      unitIds: index("annotations_unit_ids").on(table.unitId),
    };
  },
);

function getDB(): NeonHttpDatabase | PostgresJsDatabase {
  if (process.env.NEON_DATABASE_URL) {
    const queryClient = neon(process.env.NEON_DATABASE_URL || "");
    const db = drizzleNeon(queryClient);
    return db;
  } else {
    const queryClient = postgres(process.env.DATABASE_URL || "");
    const db = drizzlePostgres(queryClient);
    return db;
  }
}

const db = getDB();
export default db;
