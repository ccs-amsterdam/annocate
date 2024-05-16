import db, { jobs } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinJobRole } from "../../authorization";
import { createGet } from "../../routeHelpers";
import { JobsResponseSchema } from "../schemas";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { jobId: number } }) {
  const { jobId } = params;
  return createGet({
    selectFunction: async (email, params) => {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      return job;
    },
    req,
    responseSchema: JobsResponseSchema,
    jobId: params.jobId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinJobRole(auth.jobRole, "manager")) return { message: "Unauthorized" };
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
