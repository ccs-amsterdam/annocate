import db, { codebooks, jobs } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinJobRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { CodebookResponseSchema, CodebookUpdateBodySchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { jobId: number; codebookId: number } }) {
  const { jobId, codebookId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [codebook] = await db.select().from(codebooks).where(eq(codebooks.id, codebookId));
      return codebook;
    },
    req,
    responseSchema: CodebookResponseSchema,
    jobId: params.jobId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinJobRole(auth.jobRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, { params }: { params: { jobId: number; codebookId: number } }) {
  return createUpdate({
    updateFunction: async (email, body) => {
      const [codebook] = await db.update(codebooks).set(body).where(eq(codebooks.id, params.codebookId)).returning();
      return codebook;
    },
    req,
    bodySchema: CodebookUpdateBodySchema,
    authorizeFunction: async (auth, body) => {
      if (!hasMinJobRole(auth.jobRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `Codebook with the name "${body?.name}" already exists in this job`;
    },
  });
}
