import { JobsGetParams, JobsGetResponse, JobsPostBody } from "@/app/api/jobs/route";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MiddlecatUser } from "middlecat-react";
import { useCallback, useState } from "react";
import { Pagination } from "../helpers";

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

export function useJobs(user?: MiddlecatUser, query?: string, pagination?: Pagination) {
  const baseParams: JobsGetParams = { limit: 10 };
  if (query) baseParams.query = query;
  if (pagination?.afterId) baseParams.afterId = pagination.afterId;
  if (pagination?.beforeId) baseParams.beforeId = pagination.beforeId;

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

export function usePaginatedJobs(user?: MiddlecatUser, query?: string) {
  const [pagination, setPagination] = useState<Pagination>({});
  const { data, isLoading } = useJobs(user, query, pagination);

  let lastId: number | undefined;
  let firstId: number | undefined;
  let hasNextPage = false;
  let hasPrevPage = false;

  if (data?.rows?.length) {
    lastId = data.rows[data.rows.length - 1].id;
    firstId = data.rows[0].id;
    hasNextPage = lastId < data.meta.maxId;
    hasPrevPage = firstId > data.meta.minId;
  }

  const nextPage = useCallback(() => {
    setPagination({ afterId: lastId });
  }, [lastId]);

  const prevPage = useCallback(() => {
    setPagination({ beforeId: firstId });
  }, [firstId]);

  return { data, isLoading, pagination: { nextPage, prevPage, hasNextPage, hasPrevPage } };
}
