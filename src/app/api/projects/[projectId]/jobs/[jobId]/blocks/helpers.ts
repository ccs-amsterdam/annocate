import { jobBlocks, units } from "@/drizzle/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import db from "@/drizzle/drizzle";

export async function reindexJobBlockPositions(tx: any, jobId: number): Promise<void> {
  await tx.execute(sql`
    WITH new_position AS
    (
        SELECT id, phase, row_number() OVER (PARTITION BY phase, parent_id ORDER BY position) AS newpos
        FROM ${jobBlocks}
        WHERE ${jobBlocks.jobId} = ${jobId}
    )
    UPDATE ${jobBlocks}
    SET position = new_position.newpos-1
    FROM new_position
    WHERE ${jobBlocks.id} = new_position.id
    `);
}
