import { jobBlocks, units } from "@/drizzle/schema";
import { and, eq, gte, inArray, SQL, sql } from "drizzle-orm";
import db from "@/drizzle/drizzle";
import { BlockType, JobBlockData } from "@/app/types";

interface ReIndexPositionsReturn {
  id: number;
  parentId: number;
  position: number;
  type: JobBlockData["type"];
}

export async function reIndexCodebookTree(tx: any, jobId: number): Promise<ReIndexPositionsReturn[]> {
  const res = await tx.execute(sql<ReIndexPositionsReturn[]>`
    WITH new_position AS
    (
        SELECT id, row_number() OVER (PARTITION BY parent_id ORDER BY position) AS newpos
        FROM ${jobBlocks}
        WHERE ${jobBlocks.jobId} = ${jobId}
        ORDER BY parent_id
    )
    UPDATE ${jobBlocks}
    SET position = new_position.newpos-1
    FROM new_position
    WHERE ${jobBlocks.id} = new_position.id
    RETURNING ${jobBlocks.id}, ${jobBlocks.parentId} AS "parentId", ${jobBlocks.position}, ${jobBlocks.data}->>'type' AS type
    `);
  return res.rows;
}
