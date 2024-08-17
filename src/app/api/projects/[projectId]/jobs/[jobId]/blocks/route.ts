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
        body.position = body.position - 0.5;

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
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function reindexPositions(tx: any, jobId: number): Promise<void> {
  tx.execute(sql`
    WITH new_position AS
    (
        SELECT row_number() over (order by position) AS newpos, id
        FROM ${jobBlocks}
        WHERE ${jobBlocks.jobId} = ${jobId}
    ) 
    UPDATE ${jobBlocks} 
    SET position = new_position.newpos-1
    FROM new_position
    WHERE ${jobBlocks.id} = new_position.id
    `);
}
