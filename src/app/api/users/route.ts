import db, { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "../routeHelpers";
import { UsersTableParamsSchema, UsersUpdateSchema, UsersResponseSchema, UsersCreateSchema } from "./schemas";

export async function GET(req: NextRequest) {
  return createTableGet({
    req,
    tableFunction: (email) => db.select({ email: users.email, role: users.role }).from(users).as("baseQuery"),
    paramsSchema: UsersTableParamsSchema,
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
    bodySchema: UsersCreateSchema,
    responseSchema: UsersResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (auth.role !== "admin") return { message: "Need to be Admin to add users" };
    },
    errorFunction: (status, params) => {
      if (status === 409) return `User ${params?.email} already exists`;
    },
  });
}

export async function PUT(req: NextRequest) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const updateBody = { ...body };
      if (updateBody.replaceEmail) {
        updateBody.email = updateBody.replaceEmail;
        delete updateBody.replaceEmail;
      }

      const [user] = await db.update(users).set(body).where(eq(users.email, body.email)).returning();
      return user;
    },
    req,
    bodySchema: UsersUpdateSchema,
    responseSchema: UsersResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (auth.role !== "admin") return { message: "Need to be Admin to update users" };
    },
  });
}
