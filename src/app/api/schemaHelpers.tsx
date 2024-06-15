import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { pages } from "next/dist/build/templates/app-page";
import { z } from "zod";

extendZodWithOpenApi(z);

export function createTableParamsSchema({
  pageSize = 10,
  maxPageSize = 200,
  add = {},
}: {
  pageSize?: number;
  maxPageSize?: number;
  add?: Record<string, z.ZodType<any>>;
}) {
  const base: Record<string, z.ZodType<any>> = {
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
    pageSize: z.coerce.number().min(1).max(maxPageSize).default(pageSize).openapi({
      description: "The number of items per page. Max 100",
      example: pageSize,
    }),
    nextToken: z.string().optional().openapi({
      description: "The next token to fetch the next page of results",
    }),
  };

  Object.entries(add).forEach(([key, value]) => {
    if (key in base) throw new Error(`Key ${key} already exists in base schema`);
    base[key] = value;
  });

  return z.object(base);
}

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

export const IdResponseSchema = z.object({
  id: z.number(),
});
export const voidResponseSchema = z.object({});
