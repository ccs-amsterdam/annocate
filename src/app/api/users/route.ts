import { authenticateUser, userDetails } from "@/app/api/authorization";
import db, { users } from "@/drizzle/schema";
import { NextRequest, NextResponse } from "next/server";
import { createCommonGet, validateRequestParams } from "../routeHelpers";
import { UsersGetParamsSchema, UsersPostBodySchema } from "./schemas";

export async function GET(req: NextRequest) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = validateRequestParams(req, UsersGetParamsSchema);

  const table = db
    .select({
      email: users.email,
      role: users.role,
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

export async function POST(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const createUser = UsersPostBodySchema.parse(body);
    if (!createUser.email || !createUser.role) return;
    console.log(createUser);

    const user = await userDetails(email);
    if (user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const newuser = await db.insert(users).values(createUser).returning();
    return NextResponse.json(newuser);
  } catch (e: any) {
    if (e.message.includes("duplicate key value")) {
      return NextResponse.json({ message: `You already created a job with this name` }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json(e.message, { status: 400 });
  }
}
