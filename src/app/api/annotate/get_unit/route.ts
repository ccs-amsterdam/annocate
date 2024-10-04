import db, { projects } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasMinProjectRole } from "../../authorization";
import { createGet } from "../../routeHelpers";
import { NextRequest } from "next/server";
import { AnnotateUnitSchema } from "../schemas";

// steps
// 1. try to get a unit for a user in a job
// 2. check if this returns a unit, and whether it's valid.
//    - check if job changed (join unit on job). If so, remove index from done preallocated units and remove uncoded units
//    - don't check expiration date. Instead, other users can 'steal' units if needed.
//      - stolen units are marked as stolen (not removed). When a user tries to get a stolen unit, at that point we reindex the units. (this should also prevent race conditions)
// 3. if no valid unit is found, perform assignUnits procedure
//    - get blocks. loop over blocks and prelloacate units. this can be done concurrently. Just include both a block_index and unit_index, then after allocating re-index the indices.
//    - if there are no units left, first check if uncoded units can be stolen from other users.

export async function GET(req: NextRequest, { params }: { params: { projectId: number } }) {
  const { projectId } = params;
  return createGet({
    selectFunction: async (email, urlParams) => {
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
