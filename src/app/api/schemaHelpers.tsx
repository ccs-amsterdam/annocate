import { pages } from "next/dist/build/templates/app-page";
import { z } from "zod";

export const CommonGetParamsSchema = z.object({
  query: z.string().optional(),
  sort: z.string().optional(),
  direction: z.enum(["asc", "desc"]).default("asc"),
  pageSize: z.coerce.number().default(10),
  nextToken: z.string().optional(),
});

export const GetMetaSchema = z.object({
  rows: z.number(),
  page: z.number(),
  pageSize: z.number(),
  sort: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export type CommonGetParams = z.infer<typeof CommonGetParamsSchema>;
export type GetMeta = z.infer<typeof GetMetaSchema>;
