import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { jobBlocks, jobs, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, count, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobResponseSchema, JobMetaResponseSchema, JobUpdateSchema } from "../schemas";
import { safeParams } from "@/functions/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);
  return createGet({
    selectFunction: async (email, urlParams) => {
      const jobWithBlocks = await db
        .select({
          id: jobs.id,
          name: jobs.name,
          modified: jobs.modified,
          deployed: jobs.deployed,
          blockId: jobBlocks.id,
          blockName: jobBlocks.name,
          phase: jobBlocks.phase,
          type: jobBlocks.type,
          parentId: jobBlocks.parentId,
          position: jobBlocks.position,
        })
        .from(jobs)
        .leftJoin(jobBlocks, eq(jobs.id, jobBlocks.jobId))
        .where(and(eq(jobs.projectId, params.projectId), eq(jobs.id, params.jobId)))
        .orderBy(jobBlocks.position);

      // Not really needed sinced project also has unit count, but might bring it back
      // If there are annotation blocks without units, we need to get the total units count instead
      // const needN = jobWithBlocks.some((block) => block.type === "annotation" && block.n_units === 0);
      // if (needN) {
      //   const [{ n }] = await db.select({ n: count() }).from(units).where(eq(units.projectId, params.projectId));
      //   jobWithBlocks.forEach((block) => {
      //     if (block.type === "annotation" && block.n_units === 0) block.n_units = n;
      //   });
      // }

      const blocks = jobWithBlocks
        .map(({ phase, type, blockId, parentId, position, blockName }) => ({
          id: blockId,
          name: blockName,
          type,
          phase,
          parentId,
          position,
        }))
        .filter((block) => block.id !== null);

      const result = {
        id: jobWithBlocks[0].id,
        name: jobWithBlocks[0].name,
        type: jobWithBlocks[0].type,
        phase: jobWithBlocks[0].phase,
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

export async function POST(req: Request, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);
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
    responseSchema: JobMetaResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
