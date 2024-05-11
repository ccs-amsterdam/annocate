import { authenticateUser, userDetails } from "@/app/api/authorization";
import db, { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { createCommonGet, createCommonUpdate } from "../routeHelpers";
import { UsersGetParamsSchema, UsersPostBodySchema, UsersUpdateResponseSchema } from "./schemas";

export async function GET(req: NextRequest) {
  return createCommonGet({
    req,
    tableFunction: (email) => db.select({ email: users.email, role: users.role }).from(users).as("baseQuery"),
    paramsSchema: UsersGetParamsSchema,
    idColumn: "email",
    queryColumns: ["email"],
  });
}

export async function POST(req: Request) {
  return createCommonUpdate({
    updateFunction: (email, body) => {
      return db.insert(users).values(body).returning();
    },
    req,
    bodySchema: UsersPostBodySchema,
    responseSchema: UsersUpdateResponseSchema,
    authorizeFunction: (role, body) => role === "admin",
  });
}

export async function PUT(req: Request) {
  return createCommonUpdate({
    updateFunction: (email, body) => {
      return db.update(users).set(body).where(eq(users.email, body.email)).returning();
    },
    req,
    bodySchema: UsersPostBodySchema,
    responseSchema: UsersUpdateResponseSchema,
    authorizeFunction: (role, body) => role === "admin",
  });
}
