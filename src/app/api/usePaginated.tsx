import { JobsGetParams, JobsGetResponse, JobsPostBody } from "@/app/api/jobs/schemas";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MiddlecatUser, useMiddlecat } from "middlecat-react";
import { useCallback, useEffect, useState } from "react";
import { PaginatedGetFilter, PaginatedGetParams } from "./PaginatedGet";

export interface Pagination {
  offset?: number;
}

export interface Paginate {
  nextPage: () => void;
  prevPage: () => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

function usePagination(
  table: string,
  query?: string,
  filters?: PaginatedGetFilter[],
  limit?: number,
  pagination?: Pagination,
) {
  const { user } = useMiddlecat();
  const baseParams: PaginatedGetParams = { limit: limit || 10 };
  if (query) baseParams.query = query;
  if (filters) baseParams.filters = filters;
  if (pagination?.offset) baseParams.offset = pagination.offset;

  return useQuery({
    queryKey: [table, user],
    queryFn: async () => {
      if (!user) throw new Error("User not found");
      const params: JobsGetParams = { ...baseParams };
      const res = await user.api.get<JobsGetResponse>(table, { params });
      return res.data;
    },
    enabled: !!user,
  });
}

export function usePaginated(table: string, query?: string, filters?: PaginatedGetFilter[], pageSize = 10) {
  const [pagination, setPagination] = useState<Pagination>({});
  const { data, isLoading } = usePagination(table, query, filters, pageSize, pagination);

  useEffect(() => {
    setPagination({ offset: 0 });
  }, [table, query, filters, pageSize]);

  let hasNextPage = false;
  let hasPrevPage = false;

  if (data?.rows?.length) {
    hasNextPage = pagination.offset + pageSize < data.meta.rows;
    hasPrevPage = pagination.offset > 0;
  }

  const nextPage = useCallback(() => {
    setPagination((prev) => ({ ...prev, offset: (prev.offset || 0) + pageSize }));
  }, [pageSize]);

  const prevPage = useCallback(() => {
    setPagination((prev) => ({ ...prev, offset: (prev.offset || 0) - pageSize }));
  }, [pageSize]);

  return { data, isLoading, pagination: { nextPage, prevPage, hasNextPage, hasPrevPage } };
}
