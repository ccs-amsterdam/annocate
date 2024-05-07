import { JobsGetParams, JobsGetResponseSchema, JobsPostBody } from "@/app/api/jobs/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";
import { useCommonGet } from "../queryHelpers";

export function useJobs(params: JobsGetParams, pageSize: number = 10) {
  return useCommonGet({
    endpoint: "jobs",
    params,
    responseSchema: JobsGetResponseSchema,
    pageSize,
  });
}

export function useMutateJobs(user: MiddlecatUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobsPostBody) => {
      return user.api.post("jobs", body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["jobs", user]);
    },
  });
}
