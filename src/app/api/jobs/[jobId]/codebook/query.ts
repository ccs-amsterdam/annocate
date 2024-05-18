import { useMutate } from "@/app/api/queryHelpers";
import { z } from "zod";
import { useTableGet } from "@/app/api/queryHelpers";
import { CodebooksCreateOrUpdateSchema, CodebooksResponseSchema, CodebooksTableParamsSchema } from "./schemas";

export function useCodebooks(jobId: number, initialParams?: z.infer<typeof CodebooksTableParamsSchema>) {
  return useTableGet({
    resource: "codebook",
    endpoint: `jobs/${jobId}/codebook`,
    initialParams,
    responseSchema: CodebooksResponseSchema,
  });
}

export function useCreateOrUpdateCodebook(jobId: number) {
  return useMutate({
    method: `post`,
    resource: `codebook`,
    endpoint: `jobs/${jobId}/codebook`,
    bodySchema: CodebooksCreateOrUpdateSchema,
  });
}
