import db, { projects, managers, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "../routeHelpers";
import { ProjectsTableParamsSchema, ProjectsUpdateSchema, ProjectsResponseSchema } from "./schemas";
import { hasMinRole } from "../authorization";

export async function GET(req: NextRequest) {
  return createTableGet({
    tableFunction: (email) =>
      db
        .select({
          id: projects.id,
          name: projects.name,
          created: projects.created,
          creator: projects.creator,
        })
        .from(users)
        .where(eq(users.email, email))
        .leftJoin(managers, eq(users.id, managers.userId))
        .rightJoin(projects, eq(managers.projectId, projects.id))
        .as("baseQuery"),
    req,
    paramsSchema: ProjectsTableParamsSchema,
    projectId: null,
    idColumn: "id",
    queryColumns: ["name", "creator"],
  });
}

export async function POST(req: Request) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (!user) throw new Error(`User ${email} is not registered.`);
        const [project] = await tx.insert(projects).values({ name: body.name, creator: email }).returning();
        await tx.insert(managers).values({ projectId: project.id, userId: user.id, role: "admin" });

        return project;
      });
    },
    req,
    bodySchema: ProjectsUpdateSchema,
    responseSchema: ProjectsResponseSchema,
    projectId: null,
    authorizeFunction: async (auth, body) => {
      if (!hasMinRole(auth.role, "creator")) return { message: "Need to have the Creator role to make a project" };
    },
  });
}
