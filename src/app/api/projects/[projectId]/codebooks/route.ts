import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import { codebooks } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, SQL, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { CodebookCreateBodySchema, CodebookCreateResponseSchema, CodebooksTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: (email, urlParams) => {
      const where: SQL[] = [eq(codebooks.projectId, params.projectId)];
      if (urlParams.type) where.push(eq(sql`${codebooks.codebook}->>'type'`, urlParams.type));

      return db
        .select({
          id: codebooks.id,
          projectId: codebooks.projectId,
          name: codebooks.name,
          created: codebooks.created,
          type: sql<string>`${codebooks.codebook}->>'type'`.as("type"),
        })
        .from(codebooks)
        .where(and(...where))
        .as("baseQuery");
    },
    paramsSchema: CodebooksTableParamsSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    idColumn: "id",
    queryColumns: ["name"],
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const overwrite = body.overwrite;
        delete body.overwrite;

        let query = tx
          .insert(codebooks)
          .values({ ...body, projectId: params.projectId })
          .$dynamic();

        if (overwrite) {
          query = query.onConflictDoUpdate({
            target: [codebooks.projectId, codebooks.name],
            set: { ...body },
          });
        }

        const [codebook] = await query.returning();
        return codebook;
      });
    },
    req,
    bodySchema: CodebookCreateBodySchema,
    responseSchema: CodebookCreateResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Codebook with the name "${body?.name}" already exists in this project`;
    },
  });
}
