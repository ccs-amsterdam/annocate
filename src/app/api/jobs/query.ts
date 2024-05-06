import { JobsPostBody } from "@/app/api/jobs/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";
import { PaginatedGetFilter } from "../PaginatedGet";
import { usePaginated } from "../usePaginated";

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

export function usePaginatedJobs(query?: string, filters?: PaginatedGetFilter[]) {
  return usePaginated("jobs", query, filters);
}
