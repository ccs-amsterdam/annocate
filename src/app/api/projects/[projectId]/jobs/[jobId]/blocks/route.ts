import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import db, { jobBlocks } from "@/drizzle/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { JobBlockCreateSchema } from "../../schemas";
import { PgTransaction } from "drizzle-orm/pg-core";

export async function POST(req: Request, { params }: { params: { projectId: number; jobId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        // await tx
        //   .update(jobBlocks)
        //   .set({ position: sql`${jobBlocks.position} + 1` })
        //   .where(
        //     and(
        //       eq(jobBlocks.projectId, params.projectId),
        //       eq(jobBlocks.jobId, params.jobId),
        //       gte(jobBlocks.position, body.position),
        //     ),
        //   );
        body.position = body.position - 0.1;

        const [newJobBlock] = await tx
          .insert(jobBlocks)
          .values({ projectId: params.projectId, jobId: params.jobId, ...body })
          .returning();
        await reindexPositions(tx, params.jobId);

        return newJobBlock;
      });
    },
    req,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function reindexPositions(tx: any, jobId: number) {
  const query = tx.execute(sql`
    WITH position AS
    (
        SELECT row_number() over (order by position) AS newpos, id
        FROM ${jobBlocks}
    ) 
    UPDATE ${jobBlocks} set position = position.newpos-1
    FROM position
    WHERE ${jobBlocks.id} = position.id
    `);

  await query;
}
