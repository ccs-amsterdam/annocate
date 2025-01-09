import { jobSetUnits, projects, units } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";

export async function reindexJobSetPositions(tx: any, jobSetId: number): Promise<void> {
  await tx.execute(sql`
    WITH new_position AS
    (
        SELECT row_number() over (order by position) AS newpos, id
        FROM ${jobSetUnits}
        WHERE ${jobSetUnits.jobSetId} = ${jobSetId}
    )
    UPDATE ${jobSetUnits}
    SET position = new_position.newpos-1
    FROM new_position
    WHERE ${jobSetUnits.unitId} = new_position.id
    `);
}
