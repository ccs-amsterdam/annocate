import { authenticateUser, serverRole } from "@/app/api/authorization";
import db, { jobs, managers } from "@/drizzle/schema";
import { count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { createCommonGet, validateRequestParams } from "../routeHelpers";
import { JobsGetParamsSchema, JobsPostBodySchema, JobsPostResponse } from "./schemas";

// GET /api/jobs

export async function GET(req: NextRequest) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = validateRequestParams(req, JobsGetParamsSchema);

  const table = db
    .select({
      id: jobs.id,
      name: jobs.name,
      created: jobs.created,
    })
    .from(managers)
    .where(eq(managers.email, email))
    .rightJoin(jobs, eq(managers.jobId, jobs.id))
    .as("baseQuery");

  return createCommonGet({
    table,
    params,
    idColumn: "id",
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
