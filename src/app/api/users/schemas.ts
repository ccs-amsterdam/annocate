import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { CommonGetParamsSchema } from "../schemaHelpers";

extendZodWithOpenApi(z);

export const UsersGetParamsSchema = CommonGetParamsSchema.extend({});

export const UserRoleSchema = z.enum(["admin", "creator", "guest"]).openapi({
  description: "The role of the user",
});

export const UsersGetResponseSchema = z.object({
  email: z.string(),
  role: UserRoleSchema,
});

export const UsersPostBodySchema = z.object({
  email: z.string().email().min(1).max(256),
  role: UserRoleSchema,
});
export const UsersPutBodySchema = z.object({
  email: z.string().email(),
  role: UserRoleSchema,
});
export const UsersUpdateResponseSchema = z.object({
  email: z.string(),
  role: UserRoleSchema,
});

export type UsersGetParams = z.infer<typeof UsersGetParamsSchema>;
export type UsersGetResponse = z.infer<typeof UsersGetResponseSchema>;
export type UsersPostBody = z.infer<typeof UsersPostBodySchema>;
export type UsersPutBody = z.infer<typeof UsersPutBodySchema>;
export type UsersUpdateResponse = z.infer<typeof UsersUpdateResponseSchema>;
