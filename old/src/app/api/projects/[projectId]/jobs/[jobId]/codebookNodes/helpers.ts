import { codebookNodes, units } from "@/drizzle/schema";
import { and, eq, gte, inArray, SQL, sql } from "drizzle-orm";
import db from "@/drizzle/drizzle";
import { CodebookNodeType, CodebookNodeData } from "@/app/types";

interface ReIndexPositionsReturn {
  id: number;
  parentId: number;
  position: number;
  type: CodebookNodeData["type"];
}

export async function reIndexCodebookTree(tx: any, jobId: number): Promise<ReIndexPositionsReturn[]> {
  const res = await tx.execute(sql<ReIndexPositionsReturn[]>`
    WITH new_position AS
    (
        SELECT id, row_number() OVER (PARTITION BY parent_id ORDER BY position) AS newpos
        FROM ${codebookNodes}
        WHERE ${codebookNodes.jobId} = ${jobId}
        ORDER BY parent_id
    )
    UPDATE ${codebookNodes}
    SET position = new_position.newpos-1
    FROM new_position
    WHERE ${codebookNodes.id} = new_position.id
    RETURNING ${codebookNodes.id}, ${codebookNodes.parentId} AS "parentId", ${codebookNodes.position}, ${codebookNodes.data}->>'type' AS type
    `);
  return res.rows;
}
