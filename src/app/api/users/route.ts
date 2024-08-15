import db, { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "../routeHelpers";
import { UsersTableParamsSchema, UsersUpdateBodySchema, UsersResponseSchema, UsersCreateBodySchema } from "./schemas";

export async function GET(req: NextRequest) {
  return createTableGet({
    req,
    tableFunction: (email) =>
      db.select({ id: users.id, email: users.email, role: users.role }).from(users).as("baseQuery"),
    paramsSchema: UsersTableParamsSchema,
    projectId: null,
    idColumn: "email",
    queryColumns: ["email"],
  });
}

export async function POST(req: NextRequest) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [user] = await db.insert(users).values(body).returning();
      return user;
    },
    req,
    bodySchema: UsersCreateBodySchema,
    responseSchema: UsersResponseSchema,
    projectId: null,
    authorizeFunction: async (auth, body) => {
      if (auth.role !== "admin") return { message: "Need to be Admin to add users" };
    },
    errorFunction: (status, params) => {
      if (status === 409) return `User ${params?.email} already exists`;
    },
  });
}
