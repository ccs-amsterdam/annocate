import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { TableParamsSchema } from "../schemaHelpers";
import { UserRole, userRole } from "@/app/types";
import { FormOptions } from "@/components/Forms/formHelpers";

extendZodWithOpenApi(z);

export const roleOptions: FormOptions[] = [
  { value: "guest", label: "Guest", description: "can be invited to manage or code jobs" },
  { value: "creator", label: "Creator", description: "+ can create new jobs" },
  { value: "admin", label: "Admin", description: "+ can manage users" },
];

export const UserIdSchema = z.string().uuid().openapi({
  title: "User ID",
  description: "The unique identifier of the user",
  example: "123e4567-e89b-12d3-a456-426614174000",
});

const UserEmailSchemaBase = z
  .string()
  .email()
  .min(1)
  .max(256)
  .transform((v) => v.toLowerCase());

export const UserEmailSchema = UserEmailSchemaBase.openapi({
  title: "Email",
  description: "The email address of the user.",
  example: "user@somewhere.com",
});

export const UserReplaceEmailSchema = UserEmailSchemaBase.openapi({
  title: "Replace Email",
  description:
    "Change the email address of this users. Note that this only affects job management. The email address tied to any annotations made is fixed",
  example: "user@somewhere.com",
});

export const UserRoleSchema = z.enum(userRole).openapi({
  title: "Role",
  description: "The role of the user.",
});

////////////////////

export const UsersTableParamsSchema = TableParamsSchema.extend({});

export const UsersResponseSchema = z.object({
  id: UserIdSchema,
  email: UserEmailSchema,
  role: UserRoleSchema,
});
export const UsersCreateBodySchema = z.object({
  email: UserEmailSchema,
  role: UserRoleSchema,
});
export const UsersUpdateBodySchema = z.object({
  email: UserEmailSchema.optional(),
  role: UserRoleSchema.optional(),
});
