import db, { codebooks, projects } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { CodebookResponseSchema, CodebookUpdateBodySchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; codebookId: number } }) {
  const { projectId, codebookId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [codebook] = await db
        .select()
        .from(codebooks)
        .where(and(eq(codebooks.projectId, params.projectId), eq(codebooks.id, codebookId)));
      return codebook;
    },
    req,
    responseSchema: CodebookResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { projectId: number; codebookId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [codebook] = await db
        .update(codebooks)
        .set(body)
        .where(and(eq(codebooks.projectId, params.projectId), eq(codebooks.id, params.codebookId)))
        .returning();
      return codebook;
    },
    req,
    bodySchema: CodebookUpdateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Codebook with the name "${body?.name}" already exists in this project`;
    },
  });
}
