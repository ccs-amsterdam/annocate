import db, { projects, managers, users, codebooks, jobs, units, jobUnits } from "@/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { JobsTableParamsSchema, JobsResponseSchema, JobCreateSchema, JobUpdateSchema } from "./schemas";
import { hasMinProjectRole, hasMinRole } from "@/app/api/authorization";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    tableFunction: (email) =>
      db
        .select({
          id: jobs.id,
          name: jobs.name,
          n_units: count(jobUnits.unitId),
          codebookId: jobs.codebookId,
          codebookName: sql<string>`${codebooks.name}`.as("codebookName"),
        })
        .from(jobs)
        .where(eq(jobs.projectId, params.projectId))
        .leftJoin(codebooks, eq(jobs.codebookId, codebooks.id))
        .leftJoin(jobUnits, eq(jobs.id, jobUnits.jobId))
        .as("baseQuery"),
    req,
    paramsSchema: JobsTableParamsSchema,
    responseSchema: JobsResponseSchema,
    idColumn: "id",
    queryColumns: ["name"],
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        const { units: externalIds, ...job } = body;

        const [newJob] = await tx
          .insert(jobs)
          .values({ projectId: params.projectId, ...job })
          .returning();

        if (externalIds) {
          await tx.insert(jobUnits).values(
            externalIds.map((unitId, i) => ({
              unitId: unitId,
              jobId: newJob.id,
              position: i,
            })),
          );
        }

        return newJob;
      });
    },
    req,
    bodySchema: JobCreateSchema,
    responseSchema: IdResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

type JobBody = z.infer<typeof JobUpdateSchema> | z.infer<typeof JobCreateSchema>;
export function createJobUnits(jobId: number, body: JobBody) {
  if (!body.advanced) {
    if (!body.codebookId || !body.units)
      throw new Error("codebookId and units must be provided (or advanced specification must be used)");

    return body.units.map((unitId, i) => ({
      jobId,
      unitId,
      position: i + 1,
      codebookId,
    }));
  }
}
