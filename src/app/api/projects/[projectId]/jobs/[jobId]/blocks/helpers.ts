import { jobBlocks, units } from "@/drizzle/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import db from "@/drizzle/drizzle";

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
