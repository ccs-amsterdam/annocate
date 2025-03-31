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

export const validParents: Record<BlockType, (BlockType | "ROOT")[]> = {
  annotationPhase: ["ROOT"],
  surveyPhase: ["ROOT"],
  annotationQuestion: ["annotationPhase"],
  surveyQuestion: ["surveyPhase"],
};

export const validChildren: Record<BlockType | "ROOT", BlockType[]> = Object.entries(validParents).reduce(
  (acc, [child, parents]) => {
    for (const parent of parents) {
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(child as BlockType);
    }
    return acc;
  },
  {} as Record<BlockType | "ROOT", BlockType[]>,
);

export function isValidParent(type: BlockType, parentType: BlockType | null) {
  const valid = validParents[type];
  return valid.includes(parentType ?? "ROOT");
}

// Find a way around this. Don't like it
export async function updateJobBlockTreeValues(
  update: {
    id: number;
    parentId: number | null;
    position: number;
  }[],
) {
  // verbose seems only way: https://orm.drizzle.team/docs/guides/update-many-with-different-value
  const setParentIdChunks: SQL[] = [sql`(case`];
  const setPositionChunks: SQL[] = [sql`(case`];
  const ids: number[] = [];

  for (const block of update) {
    setParentIdChunks.push(sql`when ${jobBlocks.id} = ${block.id} then ${block.parentId}`);
    setPositionChunks.push(sql`when ${jobBlocks.id} = ${block.id} then ${block.position}`);
    ids.push(block.id);
  }
  setParentIdChunks.push(sql`end)`);
  setPositionChunks.push(sql`end)`);

  const setParentId = sql.join(setParentIdChunks, sql.raw(" "));
  const setPosition = sql.join(setPositionChunks, sql.raw(" "));

  await db.update(jobBlocks).set({ parentId: setParentId, position: setPosition }).where(inArray(jobBlocks.id, ids));
}
