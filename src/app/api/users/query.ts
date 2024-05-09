import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCommonGet } from "../queryHelpers";
import { UsersGetParams, UsersGetResponseSchema, UsersPostBody } from "./schemas";
import { MiddlecatUser } from "middlecat-react";

export function useUsers(initialParams?: UsersGetParams) {
  return useCommonGet({
    endpoint: "users",
    initialParams,
    responseSchema: UsersGetResponseSchema,
  });
}

export function useMutateUsers(user?: MiddlecatUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UsersPostBody) => {
      if (!user) throw new Error("User not found");
      return user.api.post("users", body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["users", user]);
    },
  });
}
