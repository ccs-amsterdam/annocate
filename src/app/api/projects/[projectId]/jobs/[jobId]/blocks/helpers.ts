import { jobBlocks, units } from "@/drizzle/schema";
import { and, eq, gte, inArray, SQL, sql } from "drizzle-orm";
import db from "@/drizzle/drizzle";
import { BlockType } from "@/app/types";

export async function reindexJobBlockPositions(tx: any, jobId: number): Promise<void> {
  await tx.execute(sql`
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
    `);
}

const validParents: Record<BlockType, (BlockType | null)[]> = {
  annotationPhase: [null],
  surveyPhase: [null],
  unitLayout: ["annotationPhase", "annotationQuestion"],
  annotationQuestion: ["annotationPhase", "annotationQuestion", "unitLayout"],
  surveyQuestion: ["surveyPhase", "surveyQuestion"],
};

export function isValidParent(type: BlockType, parentType: BlockType | null) {
  const valid = validParents[type];
  return valid.includes(parentType);
}

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
