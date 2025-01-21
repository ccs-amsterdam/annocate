import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { jobBlocks, jobs } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  JobBlockContentResponseSchema,
  JobBlockContentTypeValidator,
  JobBlockContentUpdateSchema,
  JobBlockTreeResponseSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { safeParams } from "@/functions/utils";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { z } from "zod";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createGet({
    selectFunction: async (email, urlParams) => {
      const [block] = await db
        .select({
          id: jobBlocks.id,
          name: jobBlocks.name,
          type: jobBlocks.type,
          content: jobBlocks.content,
        })
        .from(jobBlocks)
        .where(eq(jobBlocks.id, params.blockId));

      return block;
    },
    req,
    responseSchema: JobBlockContentResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, params) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; jobId: string; blockId: string }> },
) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        const [jb] = await tx
          .update(jobBlocks)
          .set({ ...body })
          .where(eq(jobBlocks.id, params.blockId))
          .returning(); // here should return only type

        if (body.content) {
          // this throws an error if the content is invalid for this type,
          // and automatically rolls back the transaction
          JobBlockContentTypeValidator.parse({ type: jb.type, content: body.content });
        }

        return jb;
      });
    },
    req,
    bodySchema: JobBlockContentUpdateSchema,
    responseSchema: IdResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
