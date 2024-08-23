import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete, createGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import db, { codebooks, jobBlocks, jobs } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { JobBlockResponseSchema, JobBlockUpdateSchema } from "../../../schemas";
import { checkUnitIds, reindexPositions } from "../route";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: number; jobId: number; blockId: number } },
) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [block] = await db
        .select({
          id: jobBlocks.id,
          type: jobBlocks.type,
          position: jobBlocks.position,
          rules: jobBlocks.rules,
          codebookId: codebooks.id,
          codebookName: codebooks.name,
          units: jobBlocks.units,
        })
        .from(jobBlocks)
        .leftJoin(jobs, eq(jobs.id, jobBlocks.jobId))
        .leftJoin(codebooks, eq(jobBlocks.codebookId, codebooks.id))
        .where(and(eq(jobs.projectId, projectId), eq(jobBlocks.id, params.blockId)));

      return block;
    },
    req,
    responseSchema: JobBlockResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { projectId: number; jobId: number; blockId: number } },
) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        if (body.type === "annotation" && body.units) {
          await checkUnitIds(tx, body.units, params.projectId);
        }

        if (body.position !== undefined) {
          const [currentPosition] = await tx
            .select({ position: jobBlocks.position })
            .from(jobBlocks)
            .where(eq(jobBlocks.id, params.blockId));
          if (currentPosition.position < body.position) {
            body.position += 0.5;
          } else {
            body.position -= 0.5;
          }
        }

        const [newJobBlock] = await tx
          .update(jobBlocks)
          .set({ ...body })
          .where(and(eq(jobBlocks.id, params.blockId), eq(jobBlocks.projectId, params.projectId)))
          .returning();

        if (body.position !== undefined) {
          // if position changed, reindex positions
          await reindexPositions(tx, params.jobId);
        }

        return newJobBlock;
      });
    },
    req,
    bodySchema: JobBlockUpdateSchema,
    responseSchema: IdResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: number; jobId: number; blockId: number } },
) {
  return createDelete({
    deleteFunction: (email) => {
      return db.transaction(async (tx) => {
        await tx
          .delete(jobBlocks)
          .where(and(eq(jobBlocks.projectId, params.projectId), eq(jobBlocks.id, params.blockId)));
        await reindexPositions(tx, params.jobId);
        return { success: true };
      });
    },
    req,
    projectId: params.projectId,
    authorizeFunction: async (auth) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
