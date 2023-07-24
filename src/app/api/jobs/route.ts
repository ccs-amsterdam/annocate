import { NextResponse } from "next/server";
import { JobsTable } from "lib/drizzle";
import { db } from "lib/drizzle";
import { z } from "zod";

// GET /api/jobs

export async function GET() {
  let jobs;
  try {
    jobs = await getJobs();
  } catch (e: any) {
    return NextResponse.error(e.message);
  }

  return NextResponse.json(jobs);
}

export async function getJobs() {
  return await db.select().from(JobsTable);
}

// POST /api/jobs

const postSchema = z.object({
  title: z.string().min(5).max(256),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title } = postSchema.parse(body);
    const id = await newJob(title);
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json(e.message, { status: 400 });
  }
}

export async function newJob(title: string) {
  return await db.insertInto(JobsTable).values({ title }).returning("id");
}
