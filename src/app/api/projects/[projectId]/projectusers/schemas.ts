import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { projectRole } from "@/app/types";
import { FormOptions } from "@/components/Forms/formHelpers";

extendZodWithOpenApi(z);

export const projectRoleOptions: FormOptions[] = [
  { value: "manager", label: "Manager", description: "can manage the project and download results" },
  { value: "admin", label: "Admin", description: "+ can manage users" },
];

export const ProjectUserIdSchema = z.string().uuid().openapi({
  title: "ProjectUser ID",
  description: "The unique identifier of the project user",
  example: "123e4567-e89b-12d3-a456-426614174000",
});

export const ProjectUserEmailSchema = z
  .string()
  .email()
  .min(1)
  .max(256)
  .transform((val) => val.toLowerCase())
  .openapi({
    title: "Email",
    description: "The email address of the project user.",
    example: "user@somewhere.com",
  });
export const ProjectUserRoleSchema = z.enum(projectRole).openapi({
  title: "Role",
  description: "The role of the project user.",
});

////////////////////

export const ProjectUsersTableParamsSchema = createTableParamsSchema({});

export const ProjectUsersResponseSchema = z.object({
  email: ProjectUserEmailSchema,
  role: ProjectUserRoleSchema,
});

export const ProjectUsersCreateOrUpdateSchema = z.object({
  email: ProjectUserEmailSchema,
  role: ProjectUserRoleSchema,
});
