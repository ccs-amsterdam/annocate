import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { TableParamsSchema } from "@/app/api/schemaHelpers";
import { jobRole } from "@/app/types";
import { FormOptions } from "@/components/Forms/formHelpers";

extendZodWithOpenApi(z);

export const jobRoleOptions: FormOptions[] = [
  { value: "manager", label: "Manager", description: "can manage the job and download results" },
  { value: "admin", label: "Admin", description: "+ can manage users" },
];

export const JobUserIdSchema = z.string().uuid().openapi({
  title: "JobUser ID",
  description: "The unique identifier of the job user",
  example: "123e4567-e89b-12d3-a456-426614174000",
});

export const JobUserEmailSchema = z
  .string()
  .email()
  .min(1)
  .max(256)
  .transform((val) => val.toLowerCase())
  .openapi({
    title: "Email",
    description: "The email address of the job user.",
    example: "user@somewhere.com",
  });
export const JobUserRoleSchema = z.enum(jobRole).openapi({
  title: "Role",
  description: "The role of the job user.",
});

////////////////////

export const JobUsersTableParamsSchema = TableParamsSchema.extend({});

export const JobUsersResponseSchema = z.object({
  email: JobUserEmailSchema,
  role: JobUserRoleSchema,
});

export const JobUsersCreateOrUpdateSchema = z.object({
  email: JobUserEmailSchema,
  role: JobUserRoleSchema,
});
