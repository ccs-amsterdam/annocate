import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete } from "@/app/api/routeHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { isValidParent, reindexJobBlockPositions } from "../helpers";
import { safeParams } from "@/functions/utils";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: number; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createDelete({
    deleteFunction: (email) => {
      return db.transaction(async (tx) => {
        // this doesnt actually work, because the delete already triggers the
        // foreignkey constraint. For now just keep it simple that you can't
        // delete if has children. But leaving the code here in case we want
        // to let parents adopt children. (this just requires 1 additional db call)

        const [deleted] = await tx.delete(jobBlocks).where(eq(jobBlocks.id, params.blockId)).returning();

        // The deleted block's parent needs to adopt the children
        const relatives = await tx
          .select({
            id: jobBlocks.id,
            type: jobBlocks.type,
            parentId: jobBlocks.parentId,
          })
          .from(jobBlocks)
          .where(or(eq(jobBlocks.parentId, deleted.id), eq(jobBlocks.id, deleted.parentId || -1)));

        const parent = relatives.find((r) => r.id === deleted.parentId);
        const children = relatives.filter((r) => r.parentId === deleted.id) || [];

        const parentType = parent?.type || null;
        const invalidChildTypes = new Set<string>();
        for (const child of children) {
          if (!isValidParent(child.type, parentType)) {
            invalidChildTypes.add(child.type);
          }
        }
        if (invalidChildTypes.size > 0) {
          throw new Error(
            `Cannot delete this block: parent (${parentType}) can't adopt children (${Array.from(invalidChildTypes).join(", ")})`,
          );
        }

        // Set children to new parent. Increment position to put them at the end of the parent's children
        await tx
          .update(jobBlocks)
          .set({ parentId: parent?.id || null, position: sql`${jobBlocks.position} + 99999` })
          .where(eq(jobBlocks.parentId, deleted.id));

        await reindexJobBlockPositions(tx, params.jobId);
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
