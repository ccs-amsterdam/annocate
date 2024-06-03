import { hasMinProjectRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { codebooks } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { CodebookCreateBodySchema, CodebookCreateResponseSchema, CodebooksTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  return createTableGet({
    req,
    tableFunction: () =>
      db
        .select({ id: codebooks.id, projectId: codebooks.projectId, name: codebooks.name, created: codebooks.created })
        .from(codebooks)
        .where(eq(codebooks.projectId, params.projectId))
        .as("baseQuery"),
    paramsSchema: CodebooksTableParamsSchema,
    idColumn: "id",
    queryColumns: ["name"],
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const overwrite = body.overwrite;
      delete body.overwrite;

      let query = db
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
    },
    req,
    bodySchema: CodebookCreateBodySchema,
    responseSchema: CodebookCreateResponseSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Codebook with the name "${body?.name}" already exists in this project`;
    },
  });
}
