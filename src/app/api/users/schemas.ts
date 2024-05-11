import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { CommonGetParamsSchema } from "../schemaHelpers";
import { userRole, UserRole } from "@/app/types";

extendZodWithOpenApi(z);

export const roleOptions: { value: UserRole; label: string }[] = [
  { value: "guest", label: "Guest" },
  { value: "creator", label: "Creator" },
  { value: "admin", label: "Admin" },
];

export const UsersGetParamsSchema = CommonGetParamsSchema.extend({});

export const UserEmailSchema = z.string().email().min(1).max(256).openapi({
  title: "Email",
  description: "The email address of the user",
  example: "user@somewhere.com",
});
export const UserRoleSchema = z.enum(userRole).openapi({
  title: "Role",
  description: "The role of the user",
});

export const UsersGetResponseSchema = z.object({
  email: UserEmailSchema,
  role: UserRoleSchema,
});
export const UsersPostBodySchema = z.object({
  email: UserEmailSchema,
  role: UserRoleSchema,
});
export const UsersPutBodySchema = z.object({
  email: UserEmailSchema,
  role: UserRoleSchema,
});
export const UsersUpdateResponseSchema = z.object({
  email: UserEmailSchema,
  role: UserRoleSchema,
});

export type UsersGetParams = z.infer<typeof UsersGetParamsSchema>;
export type UsersGetResponse = z.infer<typeof UsersGetResponseSchema>;
export type UsersPostBody = z.infer<typeof UsersPostBodySchema>;
export type UsersPutBody = z.infer<typeof UsersPutBodySchema>;
export type UsersUpdateResponse = z.infer<typeof UsersUpdateResponseSchema>;
