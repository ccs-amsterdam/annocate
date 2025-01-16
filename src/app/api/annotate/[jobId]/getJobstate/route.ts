import { annotations, annotator, jobBlocks, jobs, projects } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, or, and, sql, isNotNull } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, safeParams } from "@/functions/utils";
import { NextRequest } from "next/server";
import {
  AnnotateUnitSchema,
  GetJobStateParamsSchema,
  GetJobStateResponseSchema,
  GetUnitParamsSchema,
} from "../schemas";
import { cookies } from "next/headers";
import { getDeviceId } from "@/functions/getDeviceId";
import { JobsetAnnotatorStatistics, Rules } from "@/app/types";

export async function GET(req: NextRequest, props: { params: Promise<{ jobId: string }> }) {
  const params = safeParams(await props.params);
  const { jobId } = params;
  const cookieStore = await cookies();

  return createGet({
    selectFunction: async (email, urlParams) => {
      let deviceId = getDeviceId(cookieStore, params.jobId);
      const userId = getUserId(email, urlParams.userId, deviceId);

      const { jobState, isNew } = await getOrCreateJobState(jobId, userId, urlParams);

      if (isNew) {
        const { currentUnit, nTotal, nCoded } = await allocateJobUnits(jobState.jobId, jobState.userId);
      }

      // const surveyAnnotations = await db
      // const blocks = await db.select().from()

      return { test: "this" };
    },
    req,
    paramsSchema: GetJobStateParamsSchema,
    // responseSchema: GetJobStateResponseSchema,
    projectId: null,
    authorizeFunction: async (auth, params) => {
      return undefined;
    },
    authenticationRequired: false,
  });
}

function getUserId(email: string, userId: string | undefined, deviceId: string) {
  if (userId) return "userId:" + userId;
  if (email) return "email:" + email;
  return "device:" + deviceId;
}

async function allocateJobUnits(jobId: number, userId: string) {
  const blocks = await db
    .select({
      position: jobBlocks.position,
      type: jobBlocks.type,
      codebookId: jobBlocks.codebookId,
      rules: jobBlocks.rules,
      units: jobBlocks.units,
      modified: jobs.modified,
      deployed: jobs.deployed,
    })
    .from(jobBlocks)
    .where(eq(jobBlocks.jobId, jobId))
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .orderBy(jobBlocks.position);

  db.transaction(async (tx) => {
    for (let block of blocks) {
    }
  });

  return { currentUnit: 0, nTotal: 0, nCoded: 0 };
}

interface Allocation {
  jobBlockId: number;
  annotatorId: number;
  unitId: number | null;
  index: number;
  isSurvey?: boolean;
}

async function reAllocateJobUnits(jobId: number, annotatorId: number) {
  const blocks = await db
    .select({
      id: jobBlocks.id,
      position: jobBlocks.position,
      type: jobBlocks.type,
      codebookId: jobBlocks.codebookId,
      rules: jobBlocks.rules,
      units: jobBlocks.units,
      modified: jobs.modified,
      deployed: jobs.deployed,
      unitIds: sql<string[] | null>`ARRAY_AGG(${annotations.unitId})`.as("unitIds"),
    })
    .from(jobBlocks)
    .where(and(eq(annotations.annotatorId, annotatorId), eq(jobBlocks.jobId, jobId)))
    .leftJoin(jobs, eq(jobs.projectId, projects.id))
    .leftJoin(annotations, eq(annotations.jobBlockId, jobBlocks.id))
    .groupBy(jobBlocks.id)
    .orderBy(jobBlocks.position, annotations.index);

  db.transaction(async (tx) => {
    tx.update(annotations).set({ index: null }).where(eq(annotations.annotatorId, annotatorId));
    const allocations: Allocation[] = [];
    let index = 0;

    for (let block of blocks) {
      if (block.type === "survey") {
        allocations.push({
          jobBlockId: block.id,
          annotatorId,
          unitId: null,
          index: index++,
          isSurvey: true,
        });
      }

      let nTotal = block.units.length;

      const overlapUnits = block.rules.overlapUnits ? await getOverlapUnits(block.id, block.rules.overlapUnits) : [];

      if (block.rules.maxUnitsPerCoder) nTotal = Math.min(nTotal, block.rules.maxUnitsPerCoder);

      // TODO: here implement the logic for allocating units

      // const nUnits = block.units.length;
      // const nCoded = block.unitIds?.length || 0;
      // const nRemaining = nUnits - nCoded;

      // const nToAllocate = Math.min(nRemaining, 10);
      // const unitIds = block.unitIds.slice(0, nToAllocate);
      // const indexes = Array.from({ length: nToAllocate }, (_, i) => nCoded + i);
      // const allocation = unitIds.map((unitId, i) => ({
      //   jobBlockId: block.id,
      //   annotatorId,
      //   unitId,
      //   index: indexes[i],
      // }));
      // allocations.push(...allocation);
    }
  });

  return { currentUnit: 0, nTotal: 0, nCoded: 0 };
}

async function prepareUnitAllocation(blockId: number, units: string[], rules: Rules) {
  if (rules.mode === "fixed") {
  }
  if (rules.mode === "expert") {
    const { maxCodersPerUnit, randomizeUnits } = rules;
    const overlapUnits = rules.overlapUnits ? await getOverlapUnits(blockId, rules.overlapUnits) : [];
  }
  if (rules.mode === "crowd") {
    const { maxCodersPerUnit, maxUnitsPerCoder } = rules;
    const overlapUnits = rules.overlapUnits ? await getOverlapUnits(blockId, rules.overlapUnits) : [];
  }
}

async function getOverlapUnits(jobBlockId: number, n: number) {
  const alreadyAssigned = await db
    .selectDistinct({ unitId: annotations.unitId })
    .from(annotations)
    .where(and(eq(annotations.jobBlockId, jobBlockId), eq(annotations.isOverlap, true), isNotNull(annotations.unitId)))
    .limit(n);

  return alreadyAssigned.map((row) => row.unitId);
}

async function getOrCreateJobState(
  jobId: number,
  userId: string,
  urlParams: Record<string, string | number> | undefined,
) {
  const [ann] = await db
    .select()
    .from(annotator)
    .where(and(eq(annotator.jobId, jobId), eq(annotator.userId, userId)))
    .limit(1);

  if (ann) {
    // TODO: verify jobaccess
    // compute jobstate
    return { jobState: ann, isNew: false };
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

  const [newAnn] = await db
    .insert(annotator)
    .values({ projectId: job.projectId, jobId, userId, urlParams })
    .returning();
  // TODO: verify jobaccess
  // allocate units and return jobstate
  return { jobState: newAnn, isNew: true };
}

async function computeJobState(annotatorId: number) {
  // jobstate has the nr of units done, and current index (lowest not done index)

  const n = await db.$count(annotations, eq(annotations.annotatorId, annotatorId));

  const [job] = await db
    .select()
    .from(annotations)
    .where(eq(annotations.annotatorId, annotatorId))
    .orderBy(annotations.annotatorId, annotations.index);
}

// On first start, allocate units
// If units are finite, can be stolen.
// to do this, calculate the rank of uncoded units as the index - annotator's progress.
// sort descending by rank, and steal the first x units
// Ideally, this would immediately update the state of all coders. Could just do
// an update based on a subquery that counts remaning for all coders that was stolen from.
// (this means we'll always have a progress table with the number of remaining units for each coder)
// alternatively, on get unit always also fetch max index, and max Done index. THis gives dynamic progress
// Note that if we fetch in batches, this also shouldn't be too slow.
