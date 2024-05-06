import { useQuery } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";
import { UsersGetResponse } from "./schemas";
import { PaginatedGetFilter } from "../PaginatedGet";
import { usePaginated } from "../usePaginated";

export function useUsers() {
  const { user } = useMiddlecat();

  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await user.api.get("users");
      const users: UsersGetResponse[] = res.data;
      return users;
    },
    enabled: !!user,
  });
}

export function usePaginatedUsers(query?: string, filters?: PaginatedGetFilter[]) {
  return usePaginated("users", query, filters);
}
