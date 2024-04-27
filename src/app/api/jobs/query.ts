import { JobsGetParams, JobsGetResponse, JobsPostBody } from "@/app/api/jobs/route";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";

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

export function useJobs(user?: MiddlecatUser, afterId?: number, query?: string) {
  const baseParams: JobsGetParams = { limit: 10 };
  if (query) baseParams.query = query;
  if (afterId) baseParams.afterId = afterId;

  return useQuery({
    queryKey: ["jobs", user],
    queryFn: async () => {
      if (!user) throw new Error("User not found");
      const params: JobsGetParams = { ...baseParams };
      const res = await user.api.get<JobsGetResponse>("jobs", { params });
      return res.data;
    },
    enabled: !!user,
  });
}
