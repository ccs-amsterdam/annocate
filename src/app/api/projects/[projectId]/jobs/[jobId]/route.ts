import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import db, { codebooks, jobBlocks, jobs } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobResponseSchema, JobsResponseSchema, JobUpdateSchema } from "../schemas";
import { n } from "next-usequerystate/dist/serializer-C_l8WgvO";

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
          rules: jobBlocks.rules,
          n_units: sql<number>`jsonb_array_length(${jobBlocks.units})`.mapWith(Number),
          codebookId: codebooks.id,
          codebookName: codebooks.name,
          n_variables: sql<number>`jsonb_array_length(${codebooks.codebook}->'variables')`.mapWith(Number),
        })
        .from(jobs)
        .leftJoin(jobBlocks, eq(jobs.id, jobBlocks.jobId))
        .leftJoin(codebooks, eq(jobBlocks.codebookId, codebooks.id))
        .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)))
        .orderBy(jobBlocks.position);
      console.log(jobWithBlocks);

      const blocks = jobWithBlocks
        .map(({ blockId, type, position, codebookId, codebookName, n_variables, rules, n_units }) => ({
          id: blockId,
          type,
          position,
          codebookId,
          codebookName,
          n_variables,
          rules,
          n_units,
        }))
        .filter((block) => block.id !== null);

      const result = {
        id: jobWithBlocks[0].id,
        name: jobWithBlocks[0].name,
        modified: jobWithBlocks[0].modified,
        deployed: jobWithBlocks[0].deployed,
        blocks,
      };
      return result;
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
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
