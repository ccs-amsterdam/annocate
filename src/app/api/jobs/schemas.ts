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

export const JobsPutBodySchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(128),
});

export const JobsUpdateResponseSchema = z.object({
  id: z.number(),
});

export type JobsPostBody = z.infer<typeof JobsPostBodySchema>;
export type JobsGetParams = z.infer<typeof JobsGetParamsSchema>;
export type JobsGetResponse = z.infer<typeof JobsGetResponseSchema>;
export type JobsPutBody = z.infer<typeof JobsPutBodySchema>;
export type JobsUpdateResponse = z.infer<typeof JobsUpdateResponseSchema>;
