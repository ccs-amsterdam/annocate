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
import { Annotation, AnnotationHistory, RawCodeBook, RawUnit, Rules, Status } from "@/app/types";

config({ path: ".env.local" });

// JOB TABLES

export interface JobConfig {
  description: string;
}

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  created: timestamp("created").notNull().defaultNow(),
  config: jsonb("job").notNull().$type<JobConfig>().default({ description: "" }),
  frozen: boolean("frozen").notNull().default(false),
});

export const codebooks = pgTable(
  "codebooks",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    codebook: jsonb("codebook").notNull().$type<RawCodeBook>(),
  },
  (table) => {
    return { jobIds: index("job_ids").on(table.jobId) };
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
    return { jobIds: index("job_ids").on(table.jobId) };
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
    return { jobIds: index("job_ids").on(table.jobId) };
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
    return { jobIds: index("job_ids").on(table.jobId) };
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

// USER TABLES

export const users = pgTable("users", {
  email: varchar("email", { length: 256 }).primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  created: timestamp("created").notNull().defaultNow(),
  isAdmin: boolean("is_admin").notNull().default(false),
  canCreateJob: boolean("can_create_job").notNull().default(false),
});

export const managers = pgTable(
  "managers",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 256 })
      .notNull()
      .references(() => users.email, { onDelete: "cascade", onUpdate: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "write", "read"] }).notNull(),
  },
  (table) => {
    return { pk: primaryKey({ columns: [table.jobId, table.email] }), emails: index("emails").on(table.email) };
  },
);

export const registeredAnnotators = pgTable(
  "annotators",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 256 })
      .notNull()
      .references(() => users.email, { onDelete: "cascade", onUpdate: "cascade" }),
    jobSetId: integer("job_set_id").references(() => jobSets.id, { onDelete: "cascade" }),
  },
  (table) => {
    return { pk: primaryKey({ columns: [table.jobId, table.email] }), emails: index("emails").on(table.email) };
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
    access: text("access", { enum: ["only_registered", "only_anonymous", "user_decides"] }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.jobSetId, table.id] }),
    };
  },
);

interface AnnotatorStatistics {
  damage?: number;
  blocked?: boolean;
}

export const annotators = pgTable(
  "annotators",
  {
    user: varchar("user_id", { length: 256 }).notNull(),
    jobSetId: integer("jobset_id"),
    statistics: jsonb("statistics").notNull().$type<AnnotatorStatistics>().default({}),
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
    status: text("status", { enum: ["DONE", "IN_PROGRESS", "PREALLOCATED"] }).$type<Status>(),

    // We register the device id for cases where we want extra privacy security.
    // If invited users with u_* params open a job from a different device, they can
    // continue the job, but they will not be able to see previous annotations.
    // For registered users this is optional. (for invited users without u_* params
    // its redundant, because the user column is already the device_id).
    deviceId: varchar("device_id", { length: 64 }),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.jobSetId, table.user, table.index] }),
      unitIds: index("unit_ids").on(table.unitId),
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
