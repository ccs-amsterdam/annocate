import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import db, { jobBlocks } from "@/drizzle/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { CreateJobBlockSchema } from "../../schemas";

export async function POST(req: Request, { params }: { params: { projectId: number; jobId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        await tx
          .update(jobBlocks)
          .set({ position: sql`${jobBlocks.position} + 1` })
          .where(and(eq(jobBlocks.jobId, params.jobId), gte(jobBlocks.position, body.position)));

        const [newJobBlock] = await tx
          .insert(jobBlocks)
          .values({ jobId: params.jobId, ...body })
          .returning();

        return newJobBlock;
      });
    },
    req,
    bodySchema: CreateJobBlockSchema,
    responseSchema: IdResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
