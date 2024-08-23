import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { set, z } from "zod";
import { GetMetaSchema } from "./schemaHelpers";
import { FieldValues, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TableParams } from "./routeHelpers";

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

export function useTableGet<Params extends TableParams, Response extends z.ZodTypeAny>({
  endpoint,
  endpointId,
  initialParams,
  responseSchema,
}: {
  endpoint: string;
  endpointId?: string;
  initialParams: Params;
  responseSchema: Response;
}) {
  const { user } = useMiddlecat();
  const pageTokens = useRef<Record<number, string>>({ 0: "" });
  const [params, setParams] = useState<Params>(initialParams);

  const { data, isLoading } = useQuery({
    queryKey: endpointId ? [endpoint, endpointId, user, params] : [endpoint, user, params],
    queryFn: async () => {
      if (!user) return;
      const url = endpointId ? `${endpoint}/${endpointId}` : endpoint;
      const res = await user.api.get(url, { params });
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
  endpoint,
  endpointId,
  params,
  responseSchema,
  disabled,
}: {
  endpoint: string;
  endpointId?: string;
  params?: Params;
  responseSchema: z.ZodType<Response>;
  disabled?: boolean;
}) {
  const { user } = useMiddlecat();
  return useQuery({
    queryKey: endpointId ? [endpoint, endpointId, user, params] : [endpoint, user, params],
    queryFn: async () => {
      if (!user) throw new Error("User not found");
      const url = endpointId ? `${endpoint}/${endpointId}` : endpoint;
      const res = await user.api.get(url, params ? { params } : undefined);
      const data = responseSchema.parse(res.data);
      return data;
    },
    enabled: !!user && !disabled,
  });
}

export function useDelete<Params>({
  endpoint,
  params,
  invalidateEndpoints,
}: {
  endpoint: string;
  params?: Params;
  invalidateEndpoints?: string[] | ((body?: Params) => string[]);
}) {
  const { user } = useMiddlecat();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not found");
      await user.api.delete(endpoint, { params });
    },
    onSuccess: () => {
      queryClient.invalidateQueries([endpoint]);
      if (invalidateEndpoints) {
        const ie = typeof invalidateEndpoints === "function" ? invalidateEndpoints(params) : invalidateEndpoints;
        ie.forEach((endpoint) => {
          queryClient.invalidateQueries([endpoint]);
        });
      }
    },
  });
}

export function useMutate<Body, Response>({
  method = "post",
  endpoint,
  bodySchema,
  responseSchema,
  invalidateEndpoints,
  mutateFunction,
}: {
  method?: "post" | "put";
  endpoint: string;
  bodySchema: z.ZodType<Body>;
  responseSchema: z.ZodType<Response>;
  invalidateEndpoints?: string[] | ((body?: Body) => string[]);
  mutateFunction?: (body: z.infer<typeof bodySchema>) => Promise<Response>;
}) {
  const { user } = useMiddlecat();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: z.infer<typeof bodySchema>) => {
      if (!user) throw new Error("User not found");
      const res = await user.api[method](endpoint, body);
      return responseSchema ? responseSchema.parse(res.data) : res.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries([endpoint]);
      if (invalidateEndpoints) {
        const ie = typeof invalidateEndpoints === "function" ? invalidateEndpoints(variables) : invalidateEndpoints;
        ie.forEach((endpoint) => {
          console.log("invalidating", endpoint);
          queryClient.invalidateQueries([endpoint]);
        });
      }
    },
  });
}
