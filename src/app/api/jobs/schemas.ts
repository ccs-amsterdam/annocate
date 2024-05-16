import { z } from "zod";
import { TableParamsSchema } from "../schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const JobsIdSchema = z.number().openapi({
  title: "Job ID",
  description: "The unique identifier of the job",
  example: 1,
});

export const JobsNameSchema = z.string().min(1).max(128).openapi({
  title: "Name",
  description:
    "The name of the job. Has to be unique for the creator (aka you). Just pick something, you can change this later",
  example: "My first job",
});

export const JobsCreatedSchema = z.coerce.date().openapi({
  title: "Created",
  description: "The date the job was created",
  example: "2021-08-09T12:34:56Z",
});

export const JobsCreatorSchema = z.string().openapi({
  title: "Creator",
  description: "The email address of the creator of the job",
  example: "god@everywhere.com",
});

export const JobsTableParamsSchema = TableParamsSchema.extend({});

export const JobsResponseSchema = z.object({
  id: JobsIdSchema,
  name: JobsNameSchema,
  created: JobsCreatedSchema,
  creator: JobsCreatorSchema,
});

export const JobsUpdateSchema = z.object({
  name: JobsNameSchema,
});
