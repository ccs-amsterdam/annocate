import { z } from "zod";

export const GetParamsSchema = z.object({
  offset: z.coerce.number().default(0),
  limit: z.coerce.number().default(10),
  query: z.coerce.string().optional(),
  sort: z.string().optional(),
  meta: z.coerce.boolean().optional(),
});

export const GetMetaSchema = z.object({
  rows: z.number(),
});

export type GetParams = z.infer<typeof GetParamsSchema>;
