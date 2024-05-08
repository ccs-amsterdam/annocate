import { useQuery } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { set, z } from "zod";
import { CommonGetParams, GetMetaSchema } from "./schemaHelpers";

export interface Paginate {
  nextPage: () => void;
  prevPage: () => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface Pagination {
  pageTokens: string[];
  page: number;
}

export function useCommonGet<Params extends CommonGetParams, Response extends z.ZodTypeAny>({
  endpoint,
  initialParams,
  responseSchema,
}: {
  endpoint: string;
  initialParams: Params;
  responseSchema: Response;
}) {
  const { user } = useMiddlecat();
  const pageTokens = useRef<Record<number, string>>({ 0: "" });
  const [params, setParams] = useState(initialParams);

  const { data, isLoading } = useQuery({
    queryKey: [endpoint, user, params],
    queryFn: async () => {
      const res = await user.api.get(endpoint, { params });
      const data = z
        .object({
          data: z.array(responseSchema),
          meta: GetMetaSchema,
          nextToken: z.string(),
        })
        .parse(res.data);
      if (data.nextToken) pageTokens.current[data.meta.page + 1] = data.nextToken;
      return data;
    },
    enabled: !!user,
  });

  let hasNextPage = !!data?.nextToken;
  let hasPrevPage = data?.meta && data.meta.page > 0;

  const nextPage = () => {
    if (!hasNextPage) return;
    const page = data.meta.page + 1;
    setParams((params) => ({ ...params, nextToken: pageTokens.current[page] || "" }));
  };

  const prevPage = () => {
    if (!hasPrevPage) return;
    const page = data.meta.page - 1;
    setParams((params) => ({ ...params, nextToken: pageTokens.current[page] || "" }));
  };

  const sortBy = (column: string, direction: "asc" | "desc") => {
    pageTokens.current = { 0: "" };
    setParams((prev) => {
      return { ...prev, sort: column, direction, nextToken: "" };
    });
  };
  const search = (query: string) => {
    pageTokens.current = { 0: "" };
    setParams((prev) => {
      return { ...prev, query, nextToken: "" };
    });
  };

  return {
    data: data?.data,
    meta: data?.meta,
    params: params,
    isLoading,
    sortBy,
    search,
    paginate: { nextPage, prevPage, hasNextPage, hasPrevPage },
  };
}
