import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete, createGet, createUpdate } from "@/app/api/routeHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, inArray, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getRecursiveChildren, isValidParent, createsCycle } from "@/functions/treeFunctions";
import { safeParams } from "@/functions/utils";
import { reIndexCodebookTree } from "../helpers";
import {
  JobBlockCreateSchema,
  JobBlockDeleteSchema,
  JobBlocksUpdateResponseSchema,
  JobBlockUpdateSchema,
} from "../schemas";
import { sortNestedBlocks } from "@/functions/treeFunctions";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { JobBlockData } from "@/app/types";
import { z } from "zod";

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const updated: z.infer<typeof JobBlocksUpdateResponseSchema> = { block: { id: params.blockId } };

        const [updatedJobBlock] = await tx
          .update(jobBlocks)
          .set({ ...body })
          .where(eq(jobBlocks.id, params.blockId))
          .returning();

        if (body.name) updated.block.name = updatedJobBlock.name;
        if (body.data) updated.block.data = body.data;

        const positionChanged = body.position && body.position !== updatedJobBlock.position;
        const parentChanged = body.parentId && body.parentId !== updatedJobBlock.parentId;
        const typeChanged = body.data?.type && body.data.type !== updatedJobBlock.data.type;

        if (positionChanged || parentChanged || typeChanged) {
          // RE-INDEX TREE AND VALIDATION
          if (body.position) body.position = body.position - 0.5;
          const tree = await reIndexCodebookTree(tx, params.jobId);

          if (createsCycle(tree, params.blockId)) throw new Error("Cycle detected in block tree");

          const i = tree.findIndex((block) => block.id === params.blockId);
          if (i === -1) throw new Error("Block not found");

          const parent = tree.find((block) => block.id === body.parentId);
          if (!parent) throw new Error("Parent not found");

          if (!isValidParent(tree[i].type, parent.type))
            throw new Error(`Invalid parent type: ${parent.type} cannot be parent of ${tree[i].type}`);

          updated.tree = tree.map((block) => ({ id: block.id, parentId: block.parentId, position: block.position }));
        }

        return updated;
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
