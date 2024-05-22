import db, { codebooks, jobs } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinJobRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { CodebookResponseSchema } from "../schemas";
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
