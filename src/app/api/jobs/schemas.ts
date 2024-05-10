import { z } from "zod";
import { CommonGetParamsSchema } from "../schemaHelpers";

export const JobsGetParamsSchema = CommonGetParamsSchema.extend({});

export const JobsGetResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  created: z.coerce.date(),
  creator: z.string(),
});

export const JobsGetMetaResponseSchema = z.object({
  rows: z.number(),
});

export const JobsPostBodySchema = z.object({
  title: z.string().min(1).max(128),
});

export type JobsPostBody = z.infer<typeof JobsPostBodySchema>;
export type JobsGetParams = z.infer<typeof JobsGetParamsSchema>;
export type JobsGetResponse = z.infer<typeof JobsGetResponseSchema>;
export interface JobsPostResponse {
  id: number;
}
