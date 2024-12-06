import { projects, units } from "@/drizzle/schema";
import { eq, sql } from "drizzle-orm";

export async function reindexUnitPositions(tx: any, projectId: number): Promise<void> {
  await tx.execute(sql`
    WITH new_position AS
    (
        SELECT row_number() over (order by position) AS newpos, id
        FROM ${units}
        WHERE ${units.projectId} = ${projectId}
    )
    UPDATE ${units}
    SET position = new_position.newpos-1
    FROM new_position
    WHERE ${units.unitId} = new_position.id
    `);
}
