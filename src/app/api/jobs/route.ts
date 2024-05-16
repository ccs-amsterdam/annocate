import db, { jobs, managers, users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "../routeHelpers";
import { JobsTableParamsSchema, JobsUpdateSchema, JobsResponseSchema } from "./schemas";
import { hasMinRole } from "../authorization";

export async function GET(req: NextRequest) {
  return createTableGet({
    tableFunction: (email) =>
      db
        .select({
          id: jobs.id,
          name: jobs.name,
          created: jobs.created,
          creator: jobs.creator,
        })
        .from(users)
        .where(eq(users.email, email))
        .leftJoin(managers, eq(users.id, managers.userId))
        .rightJoin(jobs, eq(managers.jobId, jobs.id))
        .as("baseQuery"),
    req,
    paramsSchema: JobsTableParamsSchema,
    idColumn: "id",
    queryColumns: ["name", "creator"],
  });
}

export async function POST(req: Request) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
        const [job] = await tx.insert(jobs).values({ name: body.name, creator: email }).returning();
        await tx.insert(managers).values({ jobId: job.id, userId: user.id, role: "admin" });
        return job;
      });
    },
    req,
    bodySchema: JobsUpdateSchema,
    responseSchema: JobsResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinRole(auth.role, "creator")) return { message: "Need to have the Creator role to make a project" };
    },
  });
}
