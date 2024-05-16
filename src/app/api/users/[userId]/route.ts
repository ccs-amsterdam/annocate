import db, { users } from "@/drizzle/schema";
import { createUpdate } from "../../routeHelpers";
import { UsersUpdateSchema, UsersUpdateResponseSchema } from "../schemas";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [user] = await db.update(users).set(body).where(eq(users.id, params.userId)).returning();
      return user;
    },
    req,
    bodySchema: UsersUpdateSchema,
    responseSchema: UsersUpdateResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (auth.role !== "admin") return { message: "Unauthorized" };
    },
  });
}
