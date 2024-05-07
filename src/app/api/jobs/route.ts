import { NextRequest, NextResponse } from "next/server";
import { jobs, managers, users } from "@/drizzle/schema";
import db from "@/drizzle/schema";
import { SQL, gt, like, lt, and, sql, count, eq, max, min } from "drizzle-orm";
import validateRequestParams from "@/functions/validateRequestParams";
import { authenticateUser, serverRole } from "@/functions/authorization";
import { JobsGetParamsSchema, JobsGetResponseSchema, JobsPostBodySchema, JobsPostResponse } from "./schemas";
import { CommonGet } from "../routeHelpers";
import { PgColumn } from "drizzle-orm/pg-core";

// GET /api/jobs

export async function GET(req: NextRequest) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rowsQuery = db
    .select({
      id: jobs.id,
      name: jobs.name,
      created: jobs.created,
    })
    .from(managers)
    .where(eq(managers.email, email))
    .rightJoin(jobs, eq(managers.jobId, jobs.id))
    .$dynamic();

  const metaQuery = db
    .select({
      rows: count(),
    })
    .from(managers)
    .where(eq(managers.email, email))
    .rightJoin(jobs, eq(managers.jobId, jobs.id))
    .groupBy(managers.email)
    .$dynamic();

  return CommonGet({
    req,
    table: jobs,
    rowsQuery,
    metaQuery,
    ParamSchema: JobsGetParamsSchema,
    queryColumns: ["name"],
  });
}

// POST /api/jobs

export async function POST(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { title } = JobsPostBodySchema.parse(body);

    const role = await serverRole(email);
    if (!role.canCreateJob) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = await db.transaction(async (tx) => {
      const [job] = await tx.insert(jobs).values({ name: title }).returning();
      await tx.insert(managers).values({ jobId: job.id, email, role: "owner" });
      return job.id;
    });

    const res: JobsPostResponse = { id };
    return NextResponse.json(res);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(e.message, { status: 400 });
  }
}
