import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete, createGet, createUpdate } from "@/app/api/routeHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, inArray, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getRecursiveChildren, isValidParent, createsCycle } from "@/functions/treeFunctions";
import { safeParams } from "@/functions/utils";
import { reindexJobBlockPositions } from "../helpers";
import {
  JobBlockCreateSchema,
  JobBlockDeleteSchema,
  JobBlocksUpdateResponseSchema,
  JobBlockUpdateSchema,
} from "../schemas";
import { sortNestedBlocks } from "@/functions/treeFunctions";
import { IdResponseSchema } from "@/app/api/schemaHelpers";

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        // We first perform the actual update. Then afterwards we perform additional
        // validation checks. If we fail any of these, we rollback the transaction.

        // We subtract 0.5 from the position to ensure that the new block is placed
        // before the block at that position (if it already exists)
        if (body.position) body.position = body.position - 0.5;

        const [updatedJobBlock] = await tx
          .update(jobBlocks)
          .set({ ...body })
          .where(eq(jobBlocks.id, params.blockId))
          .returning();

        // CONTENT UPDATE VALIDATION
        if (body.content) {
          JobBlockCreateSchema.parse(updatedJobBlock);
        }

        // If no position update, we're done
        if (!body.parentId && !body.position) {
          return { block: updatedJobBlock };
        }

        // TREE UPDATE VALIDATION
        let treeData = await db
          .select({
            id: jobBlocks.id,
            position: jobBlocks.position,
            type: jobBlocks.type,
            parentId: jobBlocks.parentId,
          })
          .from(jobBlocks)
          .where(eq(jobBlocks.jobId, params.jobId));

        if (createsCycle(treeData, params.blockId)) throw new Error("Cycle detected in block tree");

        const i = treeData.findIndex((block) => block.id === params.blockId);
        if (i === -1) throw new Error("Block not found");

        const parent = treeData.find((block) => block.id === body.parentId);
        if (!parent) throw new Error("Parent not found");

        if (!isValidParent(treeData[i].type, parent.type))
          throw new Error(`Invalid parent type: ${parent.type} cannot be parent of ${treeData[i].type}`);

        const tree = treeData.map((block) => ({ id: block.id, parentId: block.parentId, position: block.position }));

        return { tree, block: updatedJobBlock };
      });
    },
    req,
    bodySchema: JobBlockUpdateSchema,
    responseSchema: JobBlocksUpdateResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: number; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createDelete({
    deleteFunction: (email, urlParams) => {
      return db.transaction(async (tx) => {
        if (urlParams.recursive) {
          const blocks = await tx
            .select({
              id: jobBlocks.id,
              parentId: jobBlocks.parentId,
            })
            .from(jobBlocks)
            .where(eq(jobBlocks.jobId, params.jobId));

          const allChildren = getRecursiveChildren(blocks, params.blockId);
          const childIds = allChildren.map((child) => child.id);
          await tx.delete(jobBlocks).where(inArray(jobBlocks.id, childIds)).returning();
        }

        await tx.delete(jobBlocks).where(eq(jobBlocks.id, params.blockId)).returning();

        return { success: true };
      });
    },
    req,
    projectId: params.projectId,
    paramsSchema: JobBlockDeleteSchema,
    authorizeFunction: async (auth) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
