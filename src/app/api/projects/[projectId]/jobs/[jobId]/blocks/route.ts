import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { jobBlocks, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { JobBlockContentResponseSchema, JobBlockCreateSchema, JobBlockMetaResponseSchema } from "./schemas";
import { PgDialect, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { reindexJobBlockPositions } from "./helpers";
import { safeParams } from "@/functions/utils";
import { NextRequest } from "next/server";
import { sortNestedBlocks } from "@/functions/sortNestedBlocks";
import { z } from "zod";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createGet({
    selectFunction: async (email) => {
      const blocks = await db
        .select({
          id: jobBlocks.id,
          phase: jobBlocks.phase,
          parentId: jobBlocks.parentId,
          position: jobBlocks.position,
        })
        .from(jobBlocks)
        .where(eq(jobBlocks.jobId, params.jobId));

      const test = sortNestedBlocks(blocks);
      console.log(test);
      return test;
    },
    req,
    responseSchema: z.array(JobBlockMetaResponseSchema),
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        body.position = body.position - 0.5;

        const [newJobBlock] = await tx
          .insert(jobBlocks)
          .values({ jobId: params.jobId, ...body })
          .returning();

        await reindexJobBlockPositions(tx, params.jobId);

        return newJobBlock;
      });
    },
    req,
    bodySchema: JobBlockCreateSchema,
    responseSchema: IdResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `A block named "${body?.name}" already exists in this job`;
    },
  });
}
