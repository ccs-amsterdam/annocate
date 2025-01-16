import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { jobBlocks, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { JobBlockCreateSchema } from "./schemas";
import { PgDialect, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/mysql-core";
import { checkUnitIds, reindexJobBlockPositions } from "./helpers";
import { safeParams } from "@/functions/utils";

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
  });
}
