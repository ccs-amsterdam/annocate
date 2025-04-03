import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { codebookNodes } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { CodebookNodeCreateSchema, CodebookNodeCreateResponseSchema, CodebookNodeResponseSchema } from "./schemas";
import { safeParams } from "@/functions/utils";
import { NextRequest } from "next/server";
import { sortNestedBlocks } from "@/functions/treeFunctions";
import { z } from "zod";
import { reIndexCodebookTree } from "./helpers";
import { isValidParent } from "@/functions/treeFunctions";
import { CodebookNodeData } from "@/app/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createGet({
    selectFunction: async (email, urlParams) => {
      const blocks = await db.select().from(codebookNodes).where(eq(codebookNodes.jobId, params.jobId));
      return sortNestedBlocks(blocks);
    },
    req,
    responseSchema: z.array(CodebookNodeResponseSchema),
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function POST(req: Request, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: (email, body) => {
      return db.transaction(async (tx) => {
        body.position = body.position - 0.5;
        const values = { jobId: params.jobId, ...body };

        const [newCodebookNode] = await tx.insert(codebookNodes).values(values).returning();

        let treeData = await reIndexCodebookTree(tx, params.jobId);

        if (body.parentId !== null) {
          const parent = treeData.find((block) => block.id === body.parentId);
          if (!parent) throw new Error("Invalid parent id");
          if (!isValidParent(body.data.type, parent.type))
            throw new Error(`Invalid parent type: ${parent.type} cannot be parent of ${body.data.type}`);
        }

        const tree = treeData.map((block) => ({ id: block.id, parentId: block.parentId, position: block.position }));
        console.log(tree, newCodebookNode);
        return { tree, block: newCodebookNode };
      });
    },
    req,
    bodySchema: CodebookNodeCreateSchema,
    responseSchema: CodebookNodeCreateResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
    errorFunction: (status, body) => {
      if (status === 409) return `A block named "${body?.name}" already exists in this job`;
    },
  });
}
