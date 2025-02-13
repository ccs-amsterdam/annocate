import { QueryClient, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
  initialParams,
  responseSchema,
}: {
  endpoint: string;
  initialParams: Params;
  responseSchema: Response;
}) {
  const { user } = useMiddlecat();
  const pageTokens = useRef<Record<number, string>>({ 0: "" });
  const [params, setParams] = useState<Params>(initialParams);

  const { data, isLoading } = useQuery({
    queryKey: [endpoint, user, params],
    queryFn: async () => {
      if (!user) return;
      const url = endpoint;
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
  params,
  responseSchema,
  disabled,
}: {
  endpoint: string;
  params?: Params;
  responseSchema: z.ZodType<Response>;
  disabled?: boolean;
}) {
  const { user } = useMiddlecat();
  return useQuery({
    queryKey: [endpoint, user, params],
    queryFn: async () => {
      if (!user) throw new Error("User not found");
      const url = endpoint;
      const res = await user.api.get(url, params ? { params } : undefined);
      const data = responseSchema.parse(res.data);
      return data;
    },
    enabled: !!user && !disabled,
  });
}

export function useListGet<Params extends {}, Response>({
  endpoints,
  params,
  responseSchema,
  disabled,
}: {
  endpoints: string[];
  params?: Params;
  responseSchema: z.ZodType<Response>;
  disabled?: boolean;
}) {
  const { user } = useMiddlecat();
  return useQueries({
    queries: endpoints.map((endpoint) => ({
      queryKey: [endpoint, user, params],
      queryFn: async () => {
        if (!user) throw new Error("User not found");
        const url = endpoint;
        const res = await user.api.get(url, params ? { params } : undefined);
        const data = responseSchema.parse(res.data);
        return data;
      },
      enabled: !!user && !disabled,
    })),
    combine: (results) => {
      return {
        data: results.map((r) => r.data),
        isLoading: results.some((r) => r.isLoading),
      };
    },
  });
}

export function useDelete<Params>({
  endpoint,
  params,
  invalidateEndpoints,
  dontInvalidateSelf,
}: {
  endpoint: string;
  params?: Params;
  invalidateEndpoints?: string[] | ((body?: Params) => string[]);
  dontInvalidateSelf?: boolean; // prevent trying to refresh itself
}) {
  const { user } = useMiddlecat();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not found");
      await user.api.delete(endpoint, { params });
    },
    onSuccess: () => {
      if (!dontInvalidateSelf) queryClient.invalidateQueries({ queryKey: [endpoint] });
      if (invalidateEndpoints) {
        const ie = typeof invalidateEndpoints === "function" ? invalidateEndpoints(params) : invalidateEndpoints;
        ie.forEach((endpoint) => {
          queryClient.invalidateQueries({ queryKey: [endpoint] });
        });
      }
    },
  });
}

/**
 * Updates the cache for a specific endpoint without calling DB.
 * Great for response UI and limiting calls, but need to be extra carefull that
 * the cache is updated correctly. Any stuff that happens to the data server-side
 * needs to be replicated here. To use, provide the endpoint, the responseSchema
 * for this endpoint, and a function (oldData) => newData
 *
 * @param endpoint - The endpoint to update.
 * @param responseSchema - The Zod schema for the endpoint response
 * @param f - The function to update the old data.
 */
export function updateEndpoint<T>(
  queryClient: QueryClient,
  endpoint: string,
  responseSchema: z.ZodType<T>,
  f: (oldData: T) => T,
) {
  queryClient.setQueryData([endpoint], f);
}

/**
 * Custom hook for making a mutation request.
 *
 * @param method - The HTTP method to use for the mutation.
 * @param endpoint - The endpoint to send the mutation request to.
 * @param bodySchema - The Zod schema for validating the request body.
 * @param responseSchema - The Zod schema for validating the response.
 * @param invalidateEndpoints - Other endpoints to invalidate on success.
 * @param manualUpdate - Function to manually update the cache instead of invalidating it. Use the updateEndpoint function.
 */
export function useMutate<Body, Response>({
  method = "post",
  endpoint,
  bodySchema,
  responseSchema,
  invalidateEndpoints,
  manualUpdate,
}: {
  method?: "post" | "put";
  endpoint: string;
  bodySchema: z.ZodType<Body>;
  responseSchema: z.ZodType<Response>;
  invalidateEndpoints?: string[] | ((body?: Body) => string[]);
  manualUpdate?: (body: z.infer<typeof bodySchema>) => void;
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
      if (manualUpdate) {
        // Manually update the cache for the endpoint, to avoid db calls
        manualUpdate(data);
      } else {
        queryClient.invalidateQueries({ queryKey: [endpoint] });
      }

      if (invalidateEndpoints) {
        const ie = typeof invalidateEndpoints === "function" ? invalidateEndpoints(variables) : invalidateEndpoints;
        ie.forEach((endpoint) => {
          console.log("invalidating", endpoint);
          queryClient.invalidateQueries({ queryKey: [endpoint] });
        });
      }
    },
  });
}
