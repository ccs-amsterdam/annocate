import { z } from "zod";
import { CommonGetParamsSchema } from "../schemaHelpers";

export const UsersGetParamsSchema = CommonGetParamsSchema.extend({});

export const UserRoleSchema = z.enum(["admin", "creator", "guest"]);

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

export type UsersGetParams = z.infer<typeof UsersGetParamsSchema>;
export type UsersPostBody = z.infer<typeof UsersPostBodySchema>;
export type UsersGetResponse = z.infer<typeof UsersGetResponseSchema>;
export interface UsersPostResponse {
  id: number;
}
