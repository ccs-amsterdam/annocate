import { z } from "zod";
import { GetParamsSchema } from "../schemaHelpers";

export const JobsGetParamsSchema = GetParamsSchema.extend({});

export const JobsGetResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  created: z.coerce.date(),
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
