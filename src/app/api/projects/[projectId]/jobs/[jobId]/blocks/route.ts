import { hasMinProjectRole } from "@/app/api/authorization";
import { createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { jobBlocks, units } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { JobBlockCreateSchema } from "../../schemas";
import { PgDialect, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { check } from "drizzle-orm/mysql-core";
import { checkUnitIds, reindexPositions } from "./helpers";

export async function POST(req: Request, props: { params: Promise<{ projectId: number; jobId: number }> }) {
  const params = await props.params;
  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        body.position = body.position - 0.5;

        if (body.type === "annotation" && body.units) {
          await checkUnitIds(tx, body.units, params.projectId);
        }

        const [newJobBlock] = await tx
          .insert(jobBlocks)
          .values({ projectId: params.projectId, jobId: params.jobId, ...body })
          .returning();

        await reindexPositions(tx, params.jobId);

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
