import { useCommonGet } from "../queryHelpers";
import { UsersGetParams, UsersGetResponseSchema } from "./schemas";

export function useUsers(initialParams: UsersGetParams) {
  return useCommonGet({
    endpoint: "users",
    initialParams: initialParams,
    responseSchema: UsersGetResponseSchema,
  });
}
