import { z } from "zod";
import { useMutate, useTableGet } from "../queryHelpers";
import { UsersCreateSchema, UsersResponseSchema, UsersTableParamsSchema, UsersUpdateSchema } from "./schemas";

export function useUsers(initialParams?: z.infer<typeof UsersTableParamsSchema>) {
  return useTableGet({
    resource: "users",
    endpoint: "users",
    initialParams,
    responseSchema: UsersResponseSchema,
  });
}

export function useCreateUser() {
  return useMutate({
    resource: `users`,
    endpoint: `users`,
    bodySchema: UsersCreateSchema,
    responseSchema: UsersResponseSchema,
  });
}

export function useUpdateUser() {
  return useMutate({
    method: `put`,
    resource: `users`,
    endpoint: `users`,
    bodySchema: UsersUpdateSchema,
    responseSchema: UsersResponseSchema,
  });
}
