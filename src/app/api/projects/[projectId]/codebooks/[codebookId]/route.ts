import db, { codebooks, jobBlocks, projects } from "@/drizzle/schema";
import { and, count, eq, sql } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { CodebookResponseSchema, CodebookUpdateBodySchema } from "../schemas";
import { NextRequest } from "next/server";
import { create } from "domain";
import { IdResponseSchema } from "@/app/api/schemaHelpers";

export async function GET(req: NextRequest, { params }: { params: { projectId: number; codebookId: number } }) {
  const { projectId, codebookId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
      const [codebook] = await db
        .select({
          id: codebooks.id,
          projectId: codebooks.projectId,
          name: codebooks.name,
          created: codebooks.created,
          modified: codebooks.modified,
          codebook: codebooks.codebook,
          nJobs: count(jobBlocks.id),
        })
        .from(codebooks)
        .leftJoin(jobBlocks, eq(jobBlocks.codebookId, codebooks.id))
        .where(and(eq(codebooks.projectId, params.projectId), eq(codebooks.id, codebookId)))
        .groupBy(codebooks.id);
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
    responseSchema: IdResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Codebook with the name "${body?.name}" already exists in this project`;
    },
  });
}
