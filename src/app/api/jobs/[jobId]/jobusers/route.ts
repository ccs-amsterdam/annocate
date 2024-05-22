import db, { managers, users } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { JobUsersTableParamsSchema, JobUsersResponseSchema, JobUsersCreateOrUpdateSchema } from "./schemas";
import { hasMinJobRole } from "@/app/api/authorization";

export async function GET(req: NextRequest, { params }: { params: { jobId: number } }) {
  return createTableGet({
    req,
    jobId: params.jobId,
    tableFunction: (email) =>
      db
        .select({ email: users.email, role: managers.role })
        .from(managers)
        .leftJoin(users, eq(managers.userId, users.id))
        .where(eq(managers.jobId, params.jobId))
        .as("baseQuery"),
    paramsSchema: JobUsersTableParamsSchema,
    idColumn: "email",
    queryColumns: ["email"],
    authorizeFunction: async (auth, params) => {
      if (!hasMinJobRole(auth.jobRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { jobId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, body.email));
        if (!user) {
          [user] = await tx.insert(users).values({ email: body.email, role: "guest" }).returning();
          await tx.execute(sql`commit`);
        }
        const [jobuser] = await db
          .insert(managers)
          .values({ jobId: params.jobId, userId: user.id, role: body.role })
          .onConflictDoUpdate({
            target: [managers.jobId, managers.userId],
            set: { role: body.role },
          })
          .returning();
        return jobuser;
      });
    },
    req,
    jobId: params.jobId,
    bodySchema: JobUsersCreateOrUpdateSchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinJobRole(auth.jobRole, "admin")) return { message: "Unauthorized" };
    },
    errorFunction: (status, params) => {
      if (status === 409) return `User  ${params?.email} already exists`;
    },
  });
}
