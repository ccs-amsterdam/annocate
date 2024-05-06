import { users } from "@/drizzle/schema";
import { PaginatedGet } from "../PaginatedGet";
import { UsersGetResponseSchema } from "./schemas";

export async function GET(req: Request) {
  return PaginatedGet({
    table: users,
    queryColumns: ["email", "name"],
    filterColumns: [],
    responseSchema: UsersGetResponseSchema,
    req,
  });
}
