import { authenticateUser } from "@/app/api/authorization";
import db, { users } from "@/drizzle/schema";
import { count } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { createCommonGet, validateRequestParams } from "../routeHelpers";
import { UsersGetParamsSchema } from "./schemas";

export async function GET(req: NextRequest) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = validateRequestParams(req, UsersGetParamsSchema);

  const table = db
    .select({
      email: users.email,
      created: users.created,
    })
    .from(users)
    .as("baseQuery");

  return createCommonGet({
    table,
    params,
    idColumn: "email",
    queryColumns: ["email"],
  });
}
