import { createTableParamsSchema } from "@/app/api/schemaHelpers";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const JobsTableParamsSchema = createTableParamsSchema({});

export const JobsCreateSchema = z.object({
  name: z.string(),
  codebookId: z.number(),
});

export const JobsUpdateSchema = z.object({
  name: z.string().optional(),
  codebookId: z.number().optional(),
});

export const JobsResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  codebookId: z.number(),
  codebookName: z.string(),
});
