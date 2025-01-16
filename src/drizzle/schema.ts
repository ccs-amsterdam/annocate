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
  AnyPgColumn,
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
  Variable,
} from "@/app/types";
import { CodebookSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { z } from "zod";

config({ path: ".env.local" });

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
    config: jsonb("project_config").notNull().$type<ProjectConfig>().default({ description: "" }),
    maxUnits: integer("max_units").notNull().default(20000),
    frozen: boolean("frozen").notNull().default(false),
    unitsUpdated: timestamp("units_updated").notNull().defaultNow(),
  },
  (table) => {
    return [{ unq: unique("unique_creator_name").on(table.creator, table.name) }];
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
    return [
      {
        pk: primaryKey({ columns: [table.projectId, table.userId] }),
        userIdIndex: index("managers_userId_index").on(table.userId),
      },
    ];
  },
);

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    externalId: varchar("unit_id", { length: 256 }).notNull(),
    data: jsonb("data").notNull().$type<Record<string, string | number | boolean>>(),
    created: timestamp("created").notNull().defaultNow(),
    modified: timestamp("modified").notNull().defaultNow(),
  },
  (table) => {
    return [
      {
        projectUnitUidx: uniqueIndex("project_unit_uidx").on(table.projectId, table.externalId),
      },
    ];
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
    return [
      {
        projectIds: index("jobs_project_ids").on(table.projectId),
        uniqueName: unique("unique_job_name").on(table.projectId, table.name),
      },
    ];
  },
);

// This is for creating experimental groups and assigning specific coders
export const jobSets = pgTable(
  "job_sets",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
  },
  (table) => {
    return [
      {
        jobIds: index("job_sets_job_ids_idx").on(table.jobId),
        uniqueJobJobsetName: unique("jobset_job_name_unique").on(table.jobId, table.name),
      },
    ];
  },
);

export const jobSetUnits = pgTable(
  "job_set_units",
  {
    jobSetId: integer("job_set_id")
      .notNull()
      .references(() => jobSets.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id),
    position: integer("position").notNull(),
  },
  (table) => {
    return [
      {
        pk: primaryKey({ columns: [table.jobSetId, table.unitId, table.position] }),
      },
    ];
  },
);

export const jobBlocks = pgTable(
  "job_blocks",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    phase: text("phase", { enum: ["preSurvey", "annotate", "postSurvey"] }).notNull(),
    parentId: integer("parent_id").references((): AnyPgColumn => jobBlocks.id),
    position: doublePrecision("position").notNull(),
    type: text("type", { enum: ["surveyQuestion", "unitLayout", "annotationQuestion"] }).notNull(),
    block: jsonb("block").notNull().$type<Variable>(),

    setsFlags: jsonb("sets_flags").$type<string[]>(),
    ifFlags: jsonb("if_flags").$type<string[]>(),
  },
  (table) => {
    return [
      {
        jobIdIdx: index("job_blocks_job_id_idx").on(table.jobId),
        uniqueName: unique("unique_job_block_name").on(table.jobId, table.name),
      },
    ];
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
    return [
      {
        pk: primaryKey({ columns: [table.projectId, table.secret] }),
      },
    ];
  },
);

export const annotator = pgTable(
  "annotator",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    // userId can be email:{email}, user:{from url params} or device:{random device id}
    userId: varchar("user_id", { length: 256 }).notNull(),

    // if created through an invitation, include any url parameters. These can be used for links (completion, screening, etc)
    urlParams: jsonb("url_params").notNull().$type<Record<string, string | number>>().default({}),
    statistics: jsonb("statistics").notNull().$type<JobsetAnnotatorStatistics>().default({}),
  },
  (table) => {
    return [
      {
        jobIdx: index("annotator_project_idx").on(table.jobId),
        userIdx: index("annotator_user_idx").on(table.userId),
        uniqueUser: unique("unique_user").on(table.jobId, table.userId),
      },
    ];
  },
);

export const annotations = pgTable(
  "annotations",
  {
    jobBlockId: integer("job_block_id").notNull(),
    annotatorId: integer("annotator_id")
      .notNull()
      .references(() => annotator.id, { onDelete: "cascade" }),
    unitId: integer("unit_id"), // can be null for job level annotations (e.g., survey questions)

    annotation: jsonb("annotation").notNull().$type<AnnotationDictionary>(),
    history: jsonb("history").notNull().$type<AnnotationHistory[]>(),
    status: text("status", { enum: ["DONE", "IN_PROGRESS", "PREALLOCATED", "STOLEN"] })
      .$type<ServerUnitStatus>()
      .default("PREALLOCATED"),

    // We register the device id and email for cases where we want extra privacy security.
    // We store a random device ID in an httponly cookie.
    // If both the email and deviceId don't exist or match, then
    // all annotations that were made will be invisible and
    // immutable. This way, if a user changes devices, they can still continue with the job,
    // but if their login links somehow leaks, it doesn't expose their annotations
    deviceId: varchar("device_id", { length: 64 }),
    email: varchar("email", { length: 256 }),

    isOverlap: boolean("is_overlap").notNull().default(false),
    isSurvey: boolean("is_survey").notNull().default(false),
    // isGold: boolean("is_gold").notNull().default(false),
  },
  (table) => {
    return [
      {
        pk: primaryKey({ columns: [table.jobBlockId, table.annotatorId, table.unitId] }),
      },
    ];
  },
);
