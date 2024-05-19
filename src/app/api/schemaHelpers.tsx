import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { pages } from "next/dist/build/templates/app-page";
import { z } from "zod";

extendZodWithOpenApi(z);

export const TableParamsSchema = z.object({
  query: z.string().optional().openapi({
    description: "A search query to filter the results",
    example: "test",
  }),
  sort: z.string().optional().openapi({
    description: "The column to sort by",
    example: "name",
  }),
  direction: z.enum(["asc", "desc"]).default("asc").openapi({
    description: "The direction to sort by",
    example: "asc",
  }),
  pageSize: z.coerce.number().min(1).max(100).default(10).openapi({
    description: "The number of items per page. Max 100",
    example: 10,
  }),
  nextToken: z.string().optional().openapi({
    description: "The next token to fetch the next page of results",
  }),
});

export const GetMetaSchema = z.object({
  rows: z.number(),
  page: z.number(),
  pageSize: z.number(),
  sort: z.string(),
  direction: z.enum(["asc", "desc"]),
});

const nameReg = /^[a-zA-Z0-9_]+$/;
const isSafeName = (name: string) => nameReg.test(name);
export const SafeNameSchema = z.string().min(1).max(128).refine(isSafeName, {
  message: "Name must be alphanumeric and underscores only",
});
