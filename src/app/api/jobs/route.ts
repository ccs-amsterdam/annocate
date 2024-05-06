import { NextResponse } from "next/server";
import { jobs, managers, users } from "@/drizzle/schema";
import db from "@/drizzle/schema";
import { SQL, gt, like, lt, and, sql, count, eq, max, min } from "drizzle-orm";
import validateRequestParams from "@/functions/validateRequestParams";
import { authenticateUser, serverRole } from "@/functions/authorization";
import { JobsGetParamsSchema, JobsGetResponseSchema, JobsPostBodySchema, JobsPostResponse } from "./schemas";

// GET /api/jobs

export async function GET(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const params = validateRequestParams(req, JobsGetParamsSchema);
    const where: SQL[] = [];
    if (params.afterId) where.push(gt(jobs.id, params.afterId));
    if (params.beforeId) where.push(lt(jobs.id, params.beforeId));
    if (params.query) where.push(like(jobs.name, `%${params.query}%`));

    const metaPromise = db.select({ rows: count(), maxId: max(jobs.id), minId: min(jobs.id) }).from(jobs);
    const rowsPromise = db
      .select()
      .from(jobs)
      .orderBy(jobs.id)
      .where(and(...where))
      .limit(params.limit);
    const [meta, rows] = await Promise.all([metaPromise, rowsPromise]);

    const res = JobsGetResponseSchema.parse({ meta, rows });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
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
