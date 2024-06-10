import db, { projects } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet } from "@/app/api/routeHelpers";
import { NextRequest } from "next/server";
import { AnnotateUnitSchema } from "@/app/api/annotate/schemas";
import { PreviewParamsSchema } from "./schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [job] = await db.select().from(projects).where(eq(projects.id, projectId));
      return job;
    },
    req,
    paramsSchema: PreviewParamsSchema,
    responseSchema: AnnotateUnitSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
