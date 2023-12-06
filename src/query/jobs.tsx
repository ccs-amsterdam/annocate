import { JobsGetParams, JobsGetResponse } from "@/app/api/jobs/route";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";

export async function postJob(params: { user: MiddlecatUser; title: string }) {
  return params.user.api.post("jobs", { title: params.title });
}

export function useJobs(user: MiddlecatUser, query?: string) {
  const baseParams: JobsGetParams = { limit: 10 };
  if (query) baseParams.query = query;

  return useInfiniteQuery({
    queryKey: ["jobs", user],
    queryFn: async () => {
      const params: JobsGetParams = { ...baseParams };
      const res = await user.api.get<JobsGetResponse>("jobs", { params });
      return res.data;
    },
    getNextPageParam: async (lastPage, allPages) => {
      const afterId = lastPage.rows[lastPage.rows.length - 1].id;
      const params: JobsGetParams = { ...baseParams, afterId };
      const res = await user.api.get("jobs", { params });
      return res.data;
    },
    getPreviousPageParam: async (firstPage, allPages) => {
      const beforeId = firstPage.rows[0].id;
      const params: JobsGetParams = { ...baseParams, beforeId };
      const res = await user.api.get("jobs", { params });
      return res.data;
    },
    enabled: !!user,
  });
}
