import { useInfiniteQuery } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";

export async function postJob(params: { user: MiddlecatUser; title: string }) {
  return params.user.api.post("jobs", { title: params.title });
}

export function useJobs(user: MiddlecatUser, query?: string) {
  const params = { limit: 10 };
  if (query) params.query = query;

  return useInfiniteQuery({
    queryKey: ["jobs", user],
    queryFn: async () => {
      user.api.get("jobs", { params });
    },
    getNextPageParam: async (lastPage, allPages) => {
      const afterId = lastPage.data[lastPage.data.length - 1].id;
      user.api.get("jobs", { ...params, afterId });
    },
    getPreviousPageParam: async (firstPage, allPages) => {
      const beforeId = firstPage.data[0].id;
      user.api.get("jobs", { ...params, beforeId });
    },
    enabled: !!user,
  });
}
