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

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    externalId: varchar("unit_id", { length: 256 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    unit: jsonb("unit").notNull().$type<RawUnit>(),
    codebookId: integer("codebook_id"),
    encryptionKey: varchar("encryption_key", { length: 256 }),
    modified: timestamp("modified").notNull().defaultNow(),
    type: text("type", { enum: ["annotate", "train", "test", "survey"] }).notNull(),
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
    rules: jsonb("rules").notNull().$type<Rules>(),
    codebookId: integer("codebook_id").notNull(),
  },
  (table) => {
    return { jobIds: index("job_ids").on(table.jobId) };
  },
);

export const unitGroupUnits = pgTable(
  "unit_group_units",
  {
    unitGroupId: integer("unit_group_id")
      .notNull()
      .references(() => unitGroups.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
  },
  (table) => {
    return { pk: primaryKey({ columns: [table.unitGroupId, table.unitId] }) };
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
    unitGroups: jsonb("unit_groups").notNull(),
    deployed: boolean("deployed").notNull().default(false),
  },
  (table) => {
    return { jobIds: index("job_ids").on(table.jobId) };
  },
);

// USER TABLES

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  email: varchar("email", { length: 256 }).notNull().unique(),
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
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "write", "read"] }).notNull(),
  },
  (table) => {
    return { pk: primaryKey({ columns: [table.jobId, table.userId] }) };
  },
);

export const annotators = pgTable(
  "annotators",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobSetId: integer("job_set_id")
      .notNull()
      .references(() => jobSets.id, { onDelete: "cascade" }),
  },
  (table) => {
    return { pk: primaryKey({ columns: [table.jobId, table.userId] }) };
  },
);

export const invitations = pgTable(
  "invitations",
  {
    id: varchar("id", { length: 256 }).primaryKey(),
    jobsetId: integer("jobset_id")
      .notNull()
      .references(() => jobSets.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 128 }).notNull(),
    createdIds: jsonb("created_ids").notNull().$type<string[]>().default([]),
  },
  (table) => {
    return { jobsetIds: index("jobset_ids").on(table.jobsetId) };
  },
);

export const annotations = pgTable(
  "annotations",
  {
    jobId: integer("job_id").notNull(),
    // user is email for registered users, or secret id for anonymous users
    user: varchar("user_id", { length: 256 }).notNull(),
    index: integer("index").notNull(),
    unitId: integer("unit_id").notNull(),
    preallocateTime: timestamp("preallocate_time"),
    annotation: jsonb("annotation").notNull().$type<Annotation[]>(),
    history: jsonb("history").notNull().$type<AnnotationHistory[]>(),
    status: text("status").$type<Status>(),
    sessionSecret: varchar("device_id", { length: 64 }),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.jobId, table.user, table.index] }),
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
