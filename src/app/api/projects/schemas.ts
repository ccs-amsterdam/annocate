import { z } from "zod";
import { createTableParamsSchema } from "../schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const ProjectsIdSchema = z.number().openapi({
  title: "Job ID",
  description: "The unique identifier of the job",
  example: 1,
});

export const ProjectsNameSchema = z.string().min(1).max(128).openapi({
  title: "Name",
  description:
    "The name of the job. Has to be unique for the creator (aka you). Just pick something, you can change this later",
  example: "My first job",
});

export const ProjectsCreatedSchema = z.coerce.date().openapi({
  title: "Created",
  description: "The date the job was created",
  example: "2021-08-09T12:34:56Z",
});

export const ProjectsCreatorSchema = z.string().openapi({
  title: "Creator",
  description: "The email address of the creator of the job",
  example: "god@everywhere.com",
});

export const ProjectUnitsSchema = z.number().openapi({
  title: "Units",
  description: "The number of units in the job",
  example: 100,
});

export const ProjectsTableParamsSchema = createTableParamsSchema({});

export const ProjectsResponseSchema = z.object({
  id: ProjectsIdSchema,
  name: ProjectsNameSchema,
  created: ProjectsCreatedSchema,
  creator: ProjectsCreatorSchema,
});

export const ProjectResponseSchema = ProjectsResponseSchema.extend({});

export const ProjectsCreateSchema = z.object({
  name: ProjectsNameSchema,
});
export const ProjectsUpdateSchema = z.object({
  name: ProjectsNameSchema,
});
