import { useCommonGet } from "../queryHelpers";
import { UsersGetParams, UsersGetResponseSchema } from "./schemas";

export function useUsers(params: UsersGetParams) {
  return useCommonGet({
    endpoint: "users",
    params: params,
    responseSchema: UsersGetResponseSchema,
  });
}
