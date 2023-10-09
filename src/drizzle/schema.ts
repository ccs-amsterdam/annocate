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
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { registerService } from "@/lib/utils";

config({ path: ".env.local" });

// JOB TABLES

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull().unique(),
  created: timestamp("created").notNull().defaultNow(),
  createdBy: integer("created_by").notNull(),
});

export const codebooks = pgTable(
  "codebooks",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    codebook: jsonb("codebook").notNull(),
  },
  (table) => {
    return { jobIds: index("job_ids").on(table.jobId) };
  },
);

export const units = pgTable(
  "units",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    unitId: varchar("unit_id", { length: 256 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    unit: jsonb("unit").notNull(),
    type: text("type", { enum: ["code", "train", "test", "survey"] }).notNull(),
    group: varchar("group", { length: 256 }).default(""),
  },
  (table) => {
    return { pk: primaryKey(table.jobId, table.unitId) };
  },
);

export const unitGroups = pgTable(
  "unit_groups",
  {
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
  },
  (table) => {
    return { pk: primaryKey(table.jobId, table.name) };
  },
);

export const jobSets = pgTable("job_sets", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 256 }).notNull(),
  created: timestamp("created").notNull().defaultNow(),
  codebookId: integer("codebook_id"),
});

export const jobSetUnits = pgTable(
  "job_set_units",
  {
    jobSetId: integer("job_set_id")
      .notNull()
      .references(() => jobSets.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
  },
  (table) => {
    return { pk: primaryKey(table.jobSetId, table.unitId) };
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
    return { pk: primaryKey(table.jobId, table.userId) };
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
    return { pk: primaryKey(table.jobId, table.userId) };
  },
);

export const annotations = pgTable(
  "annotations",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created: timestamp("created").notNull().defaultNow(),
    annotation: jsonb("annotation").notNull(),
  },
  (table) => {
    return { pk: primaryKey(table.jobId, table.unitId, table.userId) };
  },
);

function getDB() {
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

const db = registerService("db", getDB);
export default db;
