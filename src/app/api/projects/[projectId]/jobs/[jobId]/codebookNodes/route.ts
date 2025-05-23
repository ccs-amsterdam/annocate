import { hasMinProjectRole } from "@/app/api/authorization";
import { createGet, createUpdate } from "@/app/api/routeHelpers";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { codebookNodes } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { CodebookNodeCreateSchema, CodebookNodeCreateResponseSchema, CodebookNodeResponseSchema } from "./schemas";
import { safeParams } from "@/functions/utils";
import { NextRequest } from "next/server";
import { codebookNodeTypeDetails, prepareCodebook } from "@/functions/treeFunctions";
import { z } from "zod";
import { reIndexCodebookTree } from "./helpers";
import { isValidParent } from "@/functions/treeFunctions";
import { CodebookNodeData } from "@/app/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(await props.params);

  return createGet({
    selectFunction: async (email, urlParams) => {
      return await db.select().from(codebookNodes).where(eq(codebookNodes.jobId, params.jobId));
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

        const { treeType } = codebookNodeTypeDetails(body.data.type);
        if (treeType === "root") throw new Error("This is impossible, but TS doesn't know that");

        const values = { jobId: params.jobId, ...body, treeType };
        const [newCodebookNode] = await tx.insert(codebookNodes).values(values).returning();

        let treeData = await reIndexCodebookTree(tx, params.jobId);

        // the new codebook node position could be updated by reindex
        const updatedPosition = treeData.find((node) => node.id === newCodebookNode.id)?.position;
        if (updatedPosition !== undefined) newCodebookNode.position = updatedPosition;

        if (body.parentId !== null) {
          const parent = treeData.find((node) => node.id === body.parentId);
          if (!parent) throw new Error("Invalid parent id");
          if (!isValidParent(body.data.type, parent.type))
            throw new Error(`Invalid parent type: ${parent.type} cannot be parent of ${body.data.type}`);
        }

        const tree = treeData.map((node) => ({ id: node.id, parentId: node.parentId, position: node.position }));

        return { tree, node: newCodebookNode };
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
      if (status === 409) return `A node named "${body?.name}" already exists in this codebook`;
    },
  });
}
