import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import db, { jobBlocks } from "@/drizzle/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { JobBlockCreateSchema, JobBlockUpdateSchema } from "../../../schemas";
import { reindexPositions } from "../route";

export async function POST(
  req: Request,
  { params }: { params: { projectId: number; jobId: number; blockId: number } },
) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        if (body.position !== undefined) {
          const [currentPosition] = await tx
            .select({ position: jobBlocks.position })
            .from(jobBlocks)
            .where(eq(jobBlocks.id, params.blockId));
          if (currentPosition.position < body.position) {
            body.position += 0.1;
          } else {
            body.position -= 0.1;
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
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
