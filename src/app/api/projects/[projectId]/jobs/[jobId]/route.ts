import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import db, { codebooks, jobBlocks, jobs } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobResponseSchema, JobsResponseSchema, JobUpdateSchema } from "../schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; jobId: number } }) {
  return createGet({
    selectFunction: async (email, urlParams) => {
      const jobWithBlocks = await db
        .select({
          id: jobs.id,
          name: jobs.name,
          modified: jobs.modified,
          deployed: jobs.deployed,
          blockId: jobBlocks.id,
          type: jobBlocks.type,
          position: jobBlocks.position,
          codebookId: jobBlocks.codebookId,
          codebookName: codebooks.name,
          rules: jobBlocks.rules,
          n_units: sql<number>`jsonb_array_length(${jobBlocks.units})`.mapWith(Number),
        })
        .from(jobs)
        .leftJoin(jobBlocks, eq(jobs.id, jobBlocks.jobId))
        .leftJoin(codebooks, eq(jobBlocks.codebookId, codebooks.id))
        .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)));

      const blocks = jobWithBlocks
        .map(({ blockId, type, position, codebookId, rules, n_units }) => ({
          id: blockId,
          type,
          position,
          codebookId,
          rules,
          n_units,
        }))
        .filter((block) => block.id !== null);

      return {
        id: jobWithBlocks[0].id,
        name: jobWithBlocks[0].name,
        modified: jobWithBlocks[0].modified,
        deployed: jobWithBlocks[0].deployed,
        blocks,
      };
    },
    req,
    responseSchema: JobResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number; jobId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        await tx
          .update(jobs)
          .set(body)
          .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)))
          .returning();
      });
    },
    req,
    bodySchema: JobUpdateSchema,
    responseSchema: JobsResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
