import { z } from "zod";
import { useGet } from "@/app/api/queryHelpers";
import { GetJobStateParamsSchema, GetJobStateResponseSchema } from "./schemas";

export function useJobState(jobId: number, jobStateParams: z.infer<typeof GetJobStateParamsSchema>) {
  return useGet({
    endpoint: `annotate/${jobId}`,
    responseSchema: GetJobStateResponseSchema,
  });
}
