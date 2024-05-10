import { JobsGetParams, JobsGetResponseSchema, JobsPostBody } from "@/app/api/jobs/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";
import { useCommonGet } from "../queryHelpers";

export function useJobs(initialParams?: JobsGetParams) {
  return useCommonGet({
    endpoint: "jobs",
    initialParams,
    responseSchema: JobsGetResponseSchema,
  });
}

export function useMutateJobs(user?: MiddlecatUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JobsPostBody) => {
      if (!user) throw new Error("User not found");
      return user.api.post("jobs", body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["jobs", user]);
    },
  });
}
