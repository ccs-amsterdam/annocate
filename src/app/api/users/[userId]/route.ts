import { NextRequest } from "next/server";
import { createUpdate } from "../../routeHelpers";
import { UsersUpdateBodySchema, UsersResponseSchema } from "../schemas";
import db, { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [user] = await db.update(users).set(body).where(eq(users.id, params.userId)).returning();
      return user;
    },
    req,
    bodySchema: UsersUpdateBodySchema,
    responseSchema: UsersResponseSchema,
    authorizeFunction: async (auth, body) => {
      const me = auth.email === body.email;
      if (auth.role !== "admin" && body.role) return { message: "Only admin can update role" };
      if (!me && auth.role !== "admin") return { message: "Need to be Admin to update users" };
    },
  });
}
