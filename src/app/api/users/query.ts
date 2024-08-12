import { z } from "zod";
import { useMutate, useTableGet } from "../queryHelpers";
import { UsersCreateBodySchema, UsersResponseSchema, UsersTableParamsSchema, UsersUpdateBodySchema } from "./schemas";
import { createOpenAPIDefinitions } from "../openapiHelpers";

export function useUsers(initialParams?: z.input<typeof UsersTableParamsSchema>) {
  return useTableGet({
    endpoint: "users",
    initialParams: initialParams || {},
    responseSchema: UsersResponseSchema,
  });
}

export function useCreateUser() {
  return useMutate({
    endpoint: `users`,
    bodySchema: UsersCreateBodySchema,
    responseSchema: UsersResponseSchema,
  });
}

export function useUpdateUser(userId: string) {
  return useMutate({
    method: `post`,
    endpoint: `users/${userId}`,
    bodySchema: UsersUpdateBodySchema,
    responseSchema: UsersResponseSchema,
    invalidateEndpoints: [`users`],
  });
}

export const openapiUsers = createOpenAPIDefinitions(
  ["User management"],
  [
    {
      path: "/users",
      method: "get",
      description: "Get all users",
      params: UsersTableParamsSchema,
      response: UsersResponseSchema,
    },
    {
      path: "/users",
      method: "post",
      description: "Create a user",
      body: UsersUpdateBodySchema,
      response: UsersResponseSchema,
    },
    {
      path: "/users",
      method: "put",
      description: "Update a user",
      body: UsersUpdateBodySchema,
      response: UsersResponseSchema,
    },
  ],
);
