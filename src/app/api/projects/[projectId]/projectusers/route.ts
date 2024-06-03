import db, { managers, users } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { ProjectUsersTableParamsSchema, ProjectUsersResponseSchema, ProjectUsersCreateOrUpdateSchema } from "./schemas";
import { hasMinProjectRole } from "@/app/api/authorization";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    projectId: params.projectId,
    tableFunction: (email) =>
      db
        .select({ email: users.email, role: managers.role })
        .from(managers)
        .leftJoin(users, eq(managers.userId, users.id))
        .where(eq(managers.projectId, params.projectId))
        .as("baseQuery"),
    paramsSchema: ProjectUsersTableParamsSchema,
    idColumn: "email",
    queryColumns: ["email"],
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, body.email));
        if (!user) {
          [user] = await tx.insert(users).values({ email: body.email, role: "guest" }).returning();
          await tx.execute(sql`commit`);
        }
        const [projectuser] = await db
          .insert(managers)
          .values({ projectId: params.projectId, userId: user.id, role: body.role })
          .onConflictDoUpdate({
            target: [managers.projectId, managers.userId],
            set: { role: body.role },
          })
          .returning();
        return projectuser;
      });
    },
    req,
    projectId: params.projectId,
    bodySchema: ProjectUsersCreateOrUpdateSchema,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "admin")) return { message: "Unauthorized" };
    },
    errorFunction: (status, params) => {
      if (status === 409) return `User  ${params?.email} already exists`;
    },
  });
}
