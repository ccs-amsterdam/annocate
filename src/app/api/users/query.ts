import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTableGet, useUpdate } from "../queryHelpers";
import { UsersTableParamsSchema, UsersResponseSchema, UsersUpdateSchema } from "./schemas";
import { useMiddlecat } from "middlecat-react";
import { z } from "zod";

export function useUsers(initialParams?: z.infer<typeof UsersTableParamsSchema>) {
  return useTableGet({
    endpoint: "users",
    initialParams,
    responseSchema: UsersResponseSchema,
  });
}

export function useUpdateUsers(userId?: string) {
  return useUpdate(`users/${userId}`, UsersUpdateSchema, UsersResponseSchema, userId);
}
