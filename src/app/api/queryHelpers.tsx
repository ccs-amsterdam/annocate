import { JobsGetParams, JobsGetResponse } from "@/app/api/jobs/schemas";
import { useQuery } from "@tanstack/react-query";
import { PgTable } from "drizzle-orm/pg-core";
import { useMiddlecat } from "middlecat-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { GetMetaSchema, GetParams } from "./schemaHelpers";

export interface Paginate {
  nextPage: () => void;
  prevPage: () => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function useCommonGet<Params extends GetParams, Response extends z.ZodTypeAny>({
  endpoint,
  params,
  responseSchema,
  pageSize,
}: {
  endpoint: string;
  params: Params;
  responseSchema: Response;
  pageSize?: number;
}) {
  const { user } = useMiddlecat();
  const [offset, setOffset] = useState(0);

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: [endpoint, user, params, "meta"],
    queryFn: async () => {
      const res = await user.api.get(endpoint, { params: { ...params, meta: 1 } });
      return GetMetaSchema.parse(res.data);
    },
    enabled: !!user,
  });

  const { data, isLoading: rowsLoading } = useQuery({
    queryKey: [endpoint, user, params, offset, pageSize],
    queryFn: async () => {
      const res = await user.api.get(endpoint, { params: { ...params, offset, limit: pageSize } });
      return z.array(responseSchema).parse(res.data);
    },
    enabled: !!user,
  });

  useEffect(() => {
    setOffset(0);
  }, [endpoint, params, user, pageSize]);

  let hasNextPage = false;
  let hasPrevPage = false;

  if (data?.length && meta?.rows) {
    hasNextPage = offset + pageSize < meta.rows;
    hasPrevPage = offset > 0;
  }

  const nextPage = useCallback(() => {
    setOffset((prev) => prev + pageSize);
  }, [pageSize]);

  const prevPage = useCallback(() => {
    setOffset((prev) => prev - pageSize);
  }, [pageSize]);

  return {
    data,
    meta,
    isLoading: rowsLoading || metaLoading,
    pagination: { nextPage, prevPage, hasNextPage, hasPrevPage },
  };
}
