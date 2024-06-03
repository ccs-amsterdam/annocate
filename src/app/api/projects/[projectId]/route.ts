import db, { projects } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "../../authorization";
import { createGet } from "../../routeHelpers";
import { ProjectsResponseSchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [job] = await db.select().from(projects).where(eq(projects.id, projectId));
      return job;
    },
    req,
    responseSchema: ProjectsResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

// First make the format for a simple job. Just data, presentation and codebook
// Then add survey support
// Then add annotation support
// Then add advanced jobs

// In simple jobs, there is one codebook, one presentation, and all units are the same.
// The job can be divided into jobsets, where each jobset has a selection of units
// you can assign coders to jobsets, and set rules. Survey questions can only
// be set before or after the units.

// in advanced jobs, users need to make jobsets of codebooks, presentations, and units.
// For each jobset they can make a selection of units, and pick one codebook and presentation.
