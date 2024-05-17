import { hasMinJobRole } from "@/app/api/authorization";
import { createTableGet, createUpdate } from "@/app/api/routeHelpers";
import db, { codebooks } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { CodebooksCreateOrUpdateSchema, CodebooksTableParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { jobId: number } }) {
  return createTableGet({
    req,
    tableFunction: () =>
      db
        .select({ id: codebooks.id, jobId: codebooks.jobId, name: codebooks.name, created: codebooks.created })
        .from(codebooks)
        .where(eq(codebooks.jobId, params.jobId))
        .as("baseQuery"),
    paramsSchema: CodebooksTableParamsSchema,
    idColumn: "id",
    queryColumns: ["name"],
  });
}

export async function POST(req: Request, { params }: { params: { jobId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [user] = await db
        .insert(codebooks)
        .values({ ...body, jobId: params.jobId })
        .onConflictDoUpdate({
          target: [codebooks.jobId, codebooks.name],
          set: { ...body },
        })
        .returning();
      return user;
    },
    req,
    bodySchema: CodebooksCreateOrUpdateSchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinJobRole(auth.jobRole, "manager")) return { message: "Unauthorized" };
    },
    errorMsgs: {
      409: "Codebook with this name already exists in this job",
    },
  });
}
