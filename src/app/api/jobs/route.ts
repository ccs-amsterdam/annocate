import db, { jobs, managers } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createCommonGet, createCommonUpdate } from "../routeHelpers";
import { JobsGetParamsSchema, JobsPostBodySchema, JobsUpdateResponseSchema, JobsPutBodySchema } from "./schemas";
import { hasMinRole } from "../authorization";

export async function GET(req: NextRequest) {
  return createCommonGet({
    tableFunction: (email) =>
      db
        .select({
          id: jobs.id,
          name: jobs.name,
          created: jobs.created,
          creator: jobs.creator,
        })
        .from(managers)
        .where(eq(managers.email, email))
        .rightJoin(jobs, eq(managers.jobId, jobs.id))
        .as("baseQuery"),
    req,
    paramsSchema: JobsGetParamsSchema,
    idColumn: "id",
    queryColumns: ["name", "creator"],
  });
}

export async function POST(req: Request) {
  return createCommonUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        const [job] = await tx.insert(jobs).values({ name: body.title, creator: email }).returning();
        await tx.insert(managers).values({ jobId: job.id, email, role: "owner" });
        return job;
      });
    },
    req,
    bodySchema: JobsPostBodySchema,
    responseSchema: JobsUpdateResponseSchema,
    authorizeFunction: (role, body) => hasMinRole(role, "creator"),
  });
}

export async function PUT(req: Request) {
  return createCommonUpdate({
    updateFunction: (email, body) => {
      return db.update(jobs).set({ name: body.title }).where(eq(jobs.id, body.id)).returning();
    },
    req,
    bodySchema: JobsPutBodySchema,
    responseSchema: JobsUpdateResponseSchema,
    authorizeFunction: (role, body) => hasMinRole(role, "creator"),
  });
}
