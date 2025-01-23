import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete, createGet, createUpdate } from "@/app/api/routeHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, inArray, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getRecursiveChildren, isValidParent } from "@/functions/treeFunctions";
import { safeParams } from "@/functions/utils";
import { reindexJobBlockPositions } from "../helpers";
import { JobBlockContentTypeValidator, JobBlockDeleteSchema, JobBlockUpdateSchema } from "../schemas";
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
        // TREE UPDATE
        // If position or parent is given, we need to check whether the tree is still valid
        if (body.position != null || body.parentId != null) {
          const blocks = await tx
            .select({
              id: jobBlocks.id,
              position: jobBlocks.position,
              type: jobBlocks.type,
              parentId: jobBlocks.parentId,
            })
            .from(jobBlocks)
            .where(eq(jobBlocks.jobId, params.jobId));

          const i = blocks.findIndex((block) => block.id === params.blockId);
          if (i === -1) throw new Error("Block not found");

          if (body.parentId) {
            const parent = blocks.find((block) => block.id === body.parentId);
            if (!parent) throw new Error("Parent not found");
            if (!isValidParent(blocks[i].type, parent.type))
              throw new Error(`Invalid parent type: ${parent.type} cannot be parent of ${blocks[i].type}`);

            // this throws an error if there are cycles
            blocks[i].parentId = body.parentId;
            sortNestedBlocks(blocks);
          }

          if (body.position) {
            const current = blocks[i].position;
            if (current < body.position) {
              body.position += 0.5;
            } else {
              body.position -= 0.5;
            }
          }
        }

        const [updatedJobBlock] = await tx
          .update(jobBlocks)
          .set({ ...body })
          .where(eq(jobBlocks.id, params.blockId))
          .returning(); // here should only return type, but Drizzle is complaining that it can't

        // CONTENT UPDATE
        // If content was also updated, we need to validate it
        // (for which we first retrieved the type from the update query above)
        // If the content is invalid for this type, an error is thrown and the transaction is rolled back
        if (body.content) {
          JobBlockContentTypeValidator.parse({ type: updatedJobBlock.type, content: body.content });
        }

        // if position or parent is updated, reindex positions so that they are integers starting at 0 within parents
        if (body.position != null || body.parentId != null) {
          await reindexJobBlockPositions(tx, params.jobId);
        }

        return { id: params.blockId };
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
