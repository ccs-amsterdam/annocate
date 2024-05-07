import db, { users } from "@/drizzle/schema";
import { NextRequest, NextResponse } from "next/server";
import { CommonGet } from "../routeHelpers";
import { UsersGetParamsSchema, UsersGetResponseSchema } from "./schemas";
import { authenticateUser } from "@/functions/authorization";
import { count } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rowsQuery = db
    .select({
      email: users.email,
      created: users.created,
    })
    .from(users)
    .$dynamic();

  const metaQuery = db
    .select({
      rows: count(),
    })
    .from(users)
    .$dynamic();

  return CommonGet({
    req,
    table: users,
    rowsQuery,
    metaQuery,
    ParamSchema: UsersGetParamsSchema,
    queryColumns: ["email"],
    defaultSort: "email",
  });
}
