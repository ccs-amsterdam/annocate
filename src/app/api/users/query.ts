import { z } from "zod";
import { useMutate, useTableGet } from "../queryHelpers";
import { UsersCreateBodySchema, UsersResponseSchema, UsersTableParamsSchema, UsersUpdateBodySchema } from "./schemas";
import { createOpenAPIDefinitions } from "../openapiHelpers";

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
    bodySchema: UsersCreateBodySchema,
    responseSchema: UsersResponseSchema,
  });
}

export function useUpdateUser(userId: string) {
  return useMutate({
    method: `post`,
    resource: `users`,
    endpoint: `users/${userId}`,
    bodySchema: UsersUpdateBodySchema,
    responseSchema: UsersResponseSchema,
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
