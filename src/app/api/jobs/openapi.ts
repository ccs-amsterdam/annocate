import { createOpenAPIDefinitions } from "../openapiHelpers";
import { JobsTableParamsSchema, JobsResponseSchema, JobsUpdateSchema } from "./schemas";

export const openapiJobs = createOpenAPIDefinitions(
  ["Job management"],
  [
    {
      path: "/jobs",
      method: "get",
      description: "Get all jobs",
      params: JobsTableParamsSchema,
      response: JobsResponseSchema,
    },
    {
      path: "/jobs",
      method: "post",
      description: "Create a job",
      body: JobsUpdateSchema,
      response: JobsResponseSchema,
    },
    {
      path: "/jobs/{userId}",
      method: "post",
      description: "Update a job",
      body: JobsUpdateSchema,
      response: JobsResponseSchema,
    },
  ],
);
