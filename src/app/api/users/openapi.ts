import { createOpenAPIDefinitions } from "../openapiHelpers";
import { UsersTableParamsSchema, UsersResponseSchema, UsersUpdateSchema } from "./schemas";

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
      body: UsersUpdateSchema,
      response: UsersResponseSchema,
    },
    {
      path: "/users/{userId}",
      method: "post",
      description: "Update a user",
      body: UsersUpdateSchema,
      response: UsersResponseSchema,
    },
  ],
);
