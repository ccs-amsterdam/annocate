import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete } from "@/app/api/routeHelpers";
import { jobBlocks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { reindexJobBlockPositions } from "../helpers";
import { safeParams } from "@/functions/utils";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: number; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createDelete({
    deleteFunction: (email) => {
      return db.transaction(async (tx) => {
        await tx.delete(jobBlocks).where(eq(jobBlocks.id, params.blockId));
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
