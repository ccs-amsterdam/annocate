import { config } from "dotenv";
import { type InferSelectModel, type InferInsertModel, max } from "drizzle-orm";
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
  customType,
  uniqueIndex,
  numeric,
  doublePrecision,
} from "drizzle-orm/pg-core";

import {
  Annotation,
  AnnotationHistory,
  Rules,
  UserRole,
  ServerUnitStatus,
  ProjectRole,
  AnnotationDictionary,
  ProjectConfig,
  Codebook,
  JobsetAnnotatorStatistics,
} from "@/app/types";
import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { z } from "zod";

config({ path: ".env.local" });

// postgres-js/drizzle is broken on the jsonb stuff, so this is a workaround till it gets fixed
const customJsonb = <TData>(name: string) =>
  customType<{ data: TData; driverData: TData }>({
    dataType() {
      return "jsonb";
    },
    toDriver(value: TData): TData {
      return value;
    },
  })(name);

// PROJECT TABLES

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

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    creator: varchar("creator_email", { length: 256 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    config: customJsonb("project_config").notNull().$type<ProjectConfig>().default({ description: "" }),
    maxUnits: integer("max_units").notNull().default(20000),
    frozen: boolean("frozen").notNull().default(false),
    unitsUpdated: timestamp("units_updated").notNull().defaultNow(),
  },
  (table) => {
    return { unq: unique("unique_creator_name").on(table.creator, table.name) };
  },
);

export const managers = pgTable(
  "managers",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_uuid")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "manager"] })
      .notNull()
      .$type<ProjectRole>()
      .default("manager"),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.projectId, table.userId] }),
      userIdIndex: index("managers_userId_index").on(table.userId),
    };
  },
);

// NOTE TO SELF
// Don't need special system for variables where coders can add codes.
// We can just post them and add them the codebook (efficiently with jsonb)
// and then also set new updated time. Whenever a coder gets a new unit,
// we include a join to the codebook table to get the updated time.
// If the updated time is newer than the coder's last update, we send the new codebook.

export const codebooks = pgTable(
  "codebooks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    created: timestamp("created").notNull().defaultNow(),
    modified: timestamp("updated").notNull().defaultNow(),
    codebook: customJsonb("codebook").notNull().$type<Codebook>(),
  },
  (table) => {
    return {
      projectIds: index("codebook_project_ids").on(table.projectId),
      unq: unique("unique_codebook_name").on(table.projectId, table.name),
    };
  },
);

export const units = pgTable(
  "units",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    unitId: varchar("unit_id", { length: 256 }).notNull(),
    position: integer("position").notNull(),
    data: customJsonb("data").notNull().$type<Record<string, string | number | boolean>>(),
    created: timestamp("created").notNull().defaultNow(),
    modified: timestamp("modified").notNull().defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.projectId, table.unitId] }),
    };
  },
);

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    modified: timestamp("modified").notNull().defaultNow(),
    deployed: boolean("deployed").notNull().default(false),
  },
  (table) => {
    return {
      projectIds: index("jobs_project_ids").on(table.projectId),
      uniqueName: unique("unique_job_name").on(table.projectId, table.name),
    };
  },
);

// current idea is that a job has blocks, like pre survey, annotation, post survey.
// each block has a codebook, which can be a survey or annotation type.
// annotation blocks furthermore have units, and rules for how to select units.
export const jobBlocks = pgTable(
  "job_blocks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }),
    position: doublePrecision("position").notNull(),
    type: text("type", { enum: ["survey", "annotation"] }).notNull(),
    codebookId: integer("codebook_id")
      .notNull()
      .references(() => codebooks.id),
    rules: customJsonb("rules").notNull().default({}).$type<Rules>(),
    units: customJsonb("units").notNull().default([]).$type<string[]>(),
  },
  (table) => {
    return {
      jobIdIdx: index("job_blocks_job_id_idx").on(table.jobId),
    };
  },
);

// todo: figure out how to rotate over multiple job ids.
// one way is to make jobId an array, but then pg doesn't take care of the foreign key constraint.
export const invitations = pgTable(
  "invitations",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    secret: varchar("id", { length: 64 }),
    label: varchar("label", { length: 64 }).notNull(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    access: text("access", { enum: ["only_authenticated", "only_anonymous", "user_decides"] }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.projectId, table.secret] }),
    };
  },
);

export const annotator = pgTable(
  "annotator",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    // userId can be email:{email}, user:{from url params} or device:{random device id}
    userId: varchar("user_id", { length: 256 }).notNull(),
    email: varchar("email", { length: 256 }),
    // if created through an invitation, include any url parameters. These can be used for links (completion, screening, etc)
    urlParams: customJsonb("url_params").notNull().$type<Record<string, string>>().default({}),
    statistics: customJsonb("statistics").notNull().$type<JobsetAnnotatorStatistics>().default({}),
  },
  (table) => {
    return {
      jobIdx: index("annotator_project_idx").on(table.jobId),
      userIdx: index("annotator_user_idx").on(table.userId),
      uniqueUser: unique("unique_user").on(table.jobId, table.userId),
    };
  },
);

export const annotations = pgTable(
  "annotations",
  {
    annotatorId: integer("annotator_id").notNull(),
    index: integer("index").notNull(),
    unitId: integer("unit_id").notNull(),

    preallocateTime: timestamp("preallocate_time"),
    annotation: customJsonb("annotation").notNull().$type<AnnotationDictionary>(),
    history: customJsonb("history").notNull().$type<AnnotationHistory[]>(),
    status: text("status", { enum: ["DONE", "IN_PROGRESS", "PREALLOCATED", "STOLEN"] })
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
      pk: primaryKey({ columns: [table.annotatorId, table.index] }),
      unitIds: index("annotations_unit_ids").on(table.unitId),
    };
  },
);
