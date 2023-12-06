import { NextResponse } from "next/server";
import { SelectJob, jobs, managers, users } from "@/drizzle/schema";
import db from "@/drizzle/schema";
import { z } from "zod";
import { SQL, gt, like, lt, and, sql, count, eq } from "drizzle-orm";
import validateRequestParams from "@/functions/validateRequestParams";
import { authenticateUser } from "@/functions/authorization";

export const runtime = "edge";

// GET /api/jobs

export interface JobsGetResponse {
  meta: {
    rows: number;
  };
  rows: SelectJob[];
}

const GetParamsSchema = z.object({
  afterId: z.number().optional(),
  beforeId: z.number().optional(),
  limit: z.number().min(1).max(100).default(10),
  query: z.string().optional(),
});

export type JobsGetParams = z.infer<typeof GetParamsSchema>;

export async function GET(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const params = validateRequestParams(req, GetParamsSchema);
    const where: SQL[] = [];
    if (params.afterId) where.push(gt(jobs.id, params.afterId));
    if (params.beforeId) where.push(lt(jobs.id, params.beforeId));
    if (params.query) where.push(like(jobs.name, `%${params.query}%`));

    const metaPromise = db.select({ rows: count() }).from(jobs);
    const rowsPromise = db
      .select()
      .from(jobs)
      .orderBy(jobs.id)
      .where(and(...where))
      .limit(params.limit);
    const [meta, rows] = await Promise.all([metaPromise, rowsPromise]);

    return NextResponse.json({ meta, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

// POST /api/jobs

const postJobSchema = z.object({
  title: z.string().min(5).max(128),
});

export interface JobsPostResponse {
  id: number;
}
export type JobsPostBody = z.infer<typeof postJobSchema>;

export async function POST(req: Request) {
  const email = await authenticateUser(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { title } = postJobSchema.parse(body);

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.canCreateJob) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = await db.transaction(async (tx) => {
      const [job] = await tx.insert(jobs).values({ name: title }).returning();
      await tx.insert(managers).values({ jobId: job.id, email, role: "owner" });
      return job.id;
    });

    const res: JobsPostResponse = { id };
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json(e.message, { status: 400 });
  }
}
