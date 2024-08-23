import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import db, { jobBlocks, units } from "@/drizzle/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { JobBlockCreateSchema } from "../../schemas";
import { PgDialect, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/mysql-core";

export async function POST(req: Request, { params }: { params: { projectId: number; jobId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        body.position = body.position - 0.5;

        if (body.type === "annotation" && body.units) {
          await checkUnitIds(tx, body.units, params.projectId);
        }

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
  await tx.execute(sql`
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

export async function checkUnitIds(tx: any, unitIds: string[], projectId: number): Promise<void> {
  const [{ n }] = await db
    .select({
      n: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(units)
    .where(and(eq(units.projectId, projectId), inArray(units.unitId, unitIds)));

  if (n !== unitIds.length) {
    throw new Error(`Invalid unitIds: ${unitIds.length - n} (out of ${unitIds.length}} not found`);
  }
}
