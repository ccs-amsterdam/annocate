import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { set, z } from "zod";
import { TableParamsSchema, GetMetaSchema } from "./schemaHelpers";
import { FieldValues, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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

type TableParams = z.input<typeof TableParamsSchema>;

export function useTableGet<Params extends TableParams, Response extends z.ZodTypeAny>({
  resource,
  endpoint,
  initialParams,
  responseSchema,
}: {
  resource: string;
  endpoint: string;
  initialParams: Params;
  responseSchema: Response;
}) {
  const { user } = useMiddlecat();
  const pageTokens = useRef<Record<number, string>>({ 0: "" });
  const [params, setParams] = useState<Params>(initialParams);

  const { data, isLoading } = useQuery({
    queryKey: [resource, user, params],
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
    setParams((params) => ({ ...(params || {}), nextToken: pageTokens.current[page] || "" }));
  };

  const prevPage = () => {
    if (!hasPrevPage || !data) return;
    const page = data.meta.page - 1;
    setParams((params) => ({ ...(params || {}), nextToken: pageTokens.current[page] || "" }));
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
    hasSearch: "query" in params && !!params.query,
    sortBy,
    search,
    params,
    setParams,
    paginate: { nextPage, prevPage, hasNextPage, hasPrevPage },
  };
}

export function useGet<Params extends {}, Response>({
  resource,
  endpoint,
  params,
  responseSchema,
}: {
  resource: string;
  endpoint: string;
  params?: Params;
  responseSchema: z.ZodType<Response>;
}) {
  const { user } = useMiddlecat();
  return useQuery({
    queryKey: [resource, user, endpoint],
    queryFn: async () => {
      if (!user) return;
      const res = await user.api.get(endpoint, params ? { params } : undefined);
      const data = responseSchema.parse(res.data);
      return data;
    },
    enabled: !!user,
  });
}

export function useMutate<Body, Response>({
  method = "post",
  resource,
  endpoint,
  bodySchema,
  responseSchema,
}: {
  method?: "post" | "put";
  resource: string;
  endpoint: string;
  bodySchema: z.ZodType<Body>;
  responseSchema?: z.ZodType<Response>;
}) {
  const { user } = useMiddlecat();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: z.infer<typeof bodySchema>) => {
      if (!user) throw new Error("User not found");
      const res = await user.api[method](endpoint, params);
      return responseSchema ? responseSchema.parse(res.data) : res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries([resource, user]);
    },
  });
}
