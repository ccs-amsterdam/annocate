import { z } from "zod";

export const UsersGetResponseSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  created: z.string(),
  isAdmin: z.boolean(),
  canCreateJob: z.boolean(),
});

export const UsersPostBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(128),
  isAdmin: z.boolean().optional(),
  canCreateJob: z.boolean().optional(),
});

export type UsersPostBody = z.infer<typeof UsersPostBodySchema>;
export type UsersGetResponse = z.infer<typeof UsersGetResponseSchema>;
export interface UsersPostResponse {
  id: number;
}
