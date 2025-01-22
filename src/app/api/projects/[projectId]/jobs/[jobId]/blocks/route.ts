import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, getTableColumns } from "drizzle-orm";
import { JobBlockCreateSchema, JobBlocksParamsSchema, JobBlocksResponseSchema } from "./schemas";
import { safeParams } from "@/functions/utils";
import { NextRequest } from "next/server";
import { sortNestedBlocks } from "@/functions/treeFunctions";
import { z } from "zod";
import { reindexJobBlockPositions } from "./helpers";
import { isValidParent } from "@/functions/treeFunctions";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createGet({
    selectFunction: async (email, urlParams) => {
      const { id, parentId, position, ...rest } = getTableColumns(jobBlocks);
      const tree = { id, parentId, position };
      const columns = !!urlParams.treeOnly ? { ...tree } : { ...rest, ...tree };

      const blocks = await db.select(columns).from(jobBlocks).where(eq(jobBlocks.jobId, params.jobId));

      return sortNestedBlocks(blocks);
    },
    req,
    paramsSchema: JobBlocksParamsSchema,
    responseSchema: z.array(JobBlocksResponseSchema),
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        if (body.parentId !== null) {
          // If parent is given, check if allowed
          const [parent] = await tx
            .select({
              id: jobBlocks.id,
              position: jobBlocks.position,
              type: jobBlocks.type,
              parentId: jobBlocks.parentId,
            })
            .from(jobBlocks)
            .where(and(eq(jobBlocks.jobId, params.jobId), eq(jobBlocks.id, body.parentId)));

          if (!parent) return { message: "Invalid parent id" };
          if (!isValidParent(body.type, parent.type))
            return { message: `Invalid parent type: ${parent.type} cannot be parent of ${body.type}` };
        }

        body.position = body.position - 0.5;
        const values = { jobId: params.jobId, ...body };

        const [newJobBlock] = await tx.insert(jobBlocks).values(values).returning();

        await reindexJobBlockPositions(tx, params.jobId);

        return newJobBlock;
      });
    },
    req,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `A block named "${body?.name}" already exists in this job`;
    },
  });
}
