import { NextResponse } from "next/server";
import { jobs, managers } from "@/drizzle/schema";
import db from "@/drizzle/schema";
import { z } from "zod";
import { SQL, gt, like, lt, and, sql, count, eq } from "drizzle-orm";
import validateRequestParams from "@/functions/validateRequestParams";
import { authenticateUser } from "../authorization";

// GET /api/jobs
const GetParamsSchema = z.object({
  afterId: z.string().optional(),
  beforeId: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  query: z.string().optional(),
});

export async function GET(req: Request) {
  const email = await authenticateUser(req.headers.get("authorization"));
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const params = validateRequestParams(req, GetParamsSchema);
    const where: SQL[] = [];
    if (params.afterId) where.push(gt("id", params.afterId));
    if (params.beforeId) where.push(lt("id", params.beforeId));
    if (params.query) where.push(like("title", `%${params.query}%`));

    const res = await db.batch([
      db.select({ rows: count() }).from(jobs),
      db
        .select()
        .from(jobs)
        .orderBy("id", "desc")
        .where(and(...where))
        .limit(params.limit),
    ]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }

  return NextResponse.json(jobs);
}

// POST /api/jobs

const postJobSchema = z.object({
  title: z.string().min(5).max(128),
});

export async function POST(req: Request) {
  const email = await authenticateUser(req.headers.get("authorization"));
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { title } = postJobSchema.parse(body);

    const [user] = await db.select().from(users).where(eq("email", email));
    if (!user || !user.canCreateJob) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = await db.transaction(async (tx) => {
      const [job] = await tx.insert(jobs).values({ name: title }).returning();
      await tx.insert(managers).values({ jobId: job.id, userId: user.id, role: "owner" });
      return job.id;
    });

    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json(e.message, { status: 400 });
  }
}
