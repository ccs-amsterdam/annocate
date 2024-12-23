import { annotations, annotator, projects } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, or, and } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import {
  AnnotateUnitSchema,
  GetJobStateParamsSchema,
  GetJobStateResponseSchema,
  GetUnitParamsSchema,
} from "../schemas";
import { cookies } from "next/headers";
import { getDeviceId } from "@/functions/getDeviceId";
import { JobsetAnnotatorStatistics } from "@/app/types";

export async function GET(req: NextRequest, props: { params: Promise<{ jobId: number }> }) {
  const params = await props.params;
  const { jobId } = params;
  const cookieStore = await cookies();

  return createGet({
    selectFunction: async (email, urlParams) => {
      let deviceId = getDeviceId(cookieStore, params.jobId);
      const userId = getUserId(email, urlParams.userId, deviceId);

      const jobState = await getOrCreateJobState(jobId, userId);

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

async function getOrCreateJobState(jobId: number, userId: string) {
  const [ann] = await db
    .select()
    .from(annotator)
    .where(and(eq(annotator.jobId, jobId), eq(annotator.userId, userId)))
    .limit(1);

  if (ann) {
    // TODO: verify jobaccess
    // compute jobstate
    return ann;
  }

  const [newAnn] = await db.insert(annotator).values({ jobId, userId }).returning();
  // TODO: verify jobaccess
  // allocate units and return jobstate
  return newAnn;
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
