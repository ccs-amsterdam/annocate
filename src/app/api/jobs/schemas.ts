import { z } from "zod";

export const JobsGetParamsSchema = z.object({
  afterId: z.number().optional(),
  beforeId: z.number().optional(),
  limit: z.number().min(1).max(100).default(10),
  query: z.string().optional(),
});

export const JobsGetResponseSchema = z.object({
  meta: z.object({
    rows: z.number(),
    maxId: z.number(),
    minId: z.number(),
  }),
  rows: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const JobsPostBodySchema = z.object({
  title: z.string().min(5).max(128),
});

export type JobsPostBody = z.infer<typeof JobsPostBodySchema>;
export type JobsGetParams = z.infer<typeof JobsGetParamsSchema>;
export type JobsGetResponse = z.infer<typeof JobsGetResponseSchema>;
export interface JobsPostResponse {
  id: number;
}
