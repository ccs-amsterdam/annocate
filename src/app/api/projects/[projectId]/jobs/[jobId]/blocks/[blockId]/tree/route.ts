import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, inArray, sql, SQL } from "drizzle-orm";
import { JobBlockTreeUpdateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { safeParams } from "@/functions/utils";
import { BlockType } from "@/app/types";
import { z } from "zod";
import { sortNestedBlocks } from "@/functions/sortNestedBlocks";
import { isValidParent, reindexJobBlockPositions, updateJobBlockTreeValues } from "../../helpers";

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: async (email, body) => {
      const blocks = await db
        .select({
          id: jobBlocks.id,
          position: jobBlocks.position,
          type: jobBlocks.type,
          parentId: jobBlocks.parentId,
        })
        .from(jobBlocks)
        .where(eq(jobBlocks.jobId, params.jobId));

      const i = blocks.findIndex((block) => block.id === params.blockId);
      if (i === -1) return { message: "Invalid block id" };

      if (body.parentId) {
        const parent = blocks.find((block) => block.id === body.parentId);
        if (!parent) return { message: "Invalid parent id" };
        if (!isValidParent(blocks[i].type, parent.type))
          return { message: `Invalid parent type: ${parent.type} cannot be parent of ${blocks[i].type}` };

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

      return db.transaction(async (tx) => {
        const [newJobBlock] = await tx
          .update(jobBlocks)
          .set({ ...body })
          .where(eq(jobBlocks.id, params.blockId))
          .returning();

        // reindex positions so that they are integers starting at 0 within parents
        await reindexJobBlockPositions(tx, params.jobId);

        return { id: params.blockId };
      });
    },
    req,
    bodySchema: JobBlockTreeUpdateSchema,
    responseSchema: IdResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
