import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { set, z } from "zod";
import { TableParamsSchema, GetMetaSchema } from "./schemaHelpers";

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

type TableParams = z.infer<typeof TableParamsSchema>;

export function useTableGet<Params extends TableParams, Response extends z.ZodTypeAny>({
  endpoint,
  initialParams,
  responseSchema,
}: {
  endpoint: string;
  initialParams?: Params;
  responseSchema: Response;
}) {
  const { user } = useMiddlecat();
  const pageTokens = useRef<Record<number, string>>({ 0: "" });
  const [params, setParams] = useState(initialParams || {});

  const { data, isLoading } = useQuery({
    queryKey: [endpoint, user, params],
    queryFn: async () => {
      if (!user) return;
      const res = await user.api.get(endpoint, { params });
      const data = z
        .object({
          data: z.array(responseSchema),
          meta: GetMetaSchema,
          nextToken: z.string(),
        })
        .parse(res.data);
      return data;
    },
    enabled: !!user,
  });

  if (data?.nextToken) pageTokens.current[data.meta.page + 1] = data.nextToken;

  let hasNextPage = !!data?.nextToken;
  let hasPrevPage = !!data?.meta && data.meta.page > 0;

  const nextPage = () => {
    if (!hasNextPage || !data) return;
    const page = data.meta.page + 1;
    setParams((params) => ({ ...params, nextToken: pageTokens.current[page] || "" }));
  };

  const prevPage = () => {
    if (!hasPrevPage || !data) return;
    const page = data.meta.page - 1;
    setParams((params) => ({ ...params, nextToken: pageTokens.current[page] || "" }));
  };

  const sortBy = (column: string, direction: "asc" | "desc") => {
    pageTokens.current = { 0: "" };
    setParams((prev) => {
      return { ...prev, sort: column, direction, nextToken: "" };
    });
  };
  const search = useCallback((query: string) => {
    pageTokens.current = { 0: "" };
    setParams((prev) => {
      return { ...prev, query, nextToken: "" };
    });
  }, []);

  return {
    data: data?.data,
    meta: data?.meta,
    isLoading,
    sortBy,
    search,
    paginate: { nextPage, prevPage, hasNextPage, hasPrevPage },
  };
}

export function useGet<T>(table: string, id: number | string, responseSchema: z.ZodType<T>) {
  const { user } = useMiddlecat();
  return useQuery({
    queryKey: [table, user, id],
    queryFn: async () => {
      if (!user) return;
      const res = await user.api.get(`${table}/${id}`);
      const data = responseSchema.parse(res.data);
      return data;
    },
    enabled: !!user,
  });
}

export function useUpdate<Update, Response>(
  table: string,
  updateSchema: z.ZodType<Update>,
  responseSchema: z.ZodType<Response>,
  updateId?: number | string,
) {
  const { user } = useMiddlecat();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: z.infer<typeof updateSchema>) => {
      if (!user) throw new Error("User not found");
      if (updateId) {
        return responseSchema.parse(await user.api.post(`${table}/${updateId}`, params));
      } else {
        return responseSchema.parse(await user.api.post(table, params));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries([table, user]);
    },
  });
}
