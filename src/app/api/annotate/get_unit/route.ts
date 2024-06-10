import db, { projects } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "../../authorization";
import { createGet } from "../../routeHelpers";
import { NextRequest } from "next/server";
import { AnnotateUnitSchema } from "../schemas";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [job] = await db.select().from(projects).where(eq(projects.id, projectId));
      return job;
    },
    req,
    responseSchema: AnnotateUnitSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
