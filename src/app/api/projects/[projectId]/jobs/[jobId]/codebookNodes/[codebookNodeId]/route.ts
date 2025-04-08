import { hasMinProjectRole } from "@/app/api/authorization";
import { createDelete, createGet, createUpdate } from "@/app/api/routeHelpers";
import { codebookNodes } from "@/drizzle/schema";
import db from "@/drizzle/drizzle";
import { eq, inArray, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getRecursiveChildren, isValidParent, createsCycle } from "@/functions/treeFunctions";
import { safeParams } from "@/functions/utils";
import { reIndexCodebookTree } from "../helpers";
import {
  CodebookNodeCreateSchema,
  CodebookNodeDeleteSchema,
  CodebookNodeUpdateResponseSchema,
  CodebookNodeUpdateSchema,
} from "../schemas";
import { prepareCodebook } from "@/functions/treeFunctions";
import { IdResponseSchema } from "@/app/api/schemaHelpers";
import { CodebookNodeData } from "@/app/types";
import { z } from "zod";

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; jobId: string; codebookNodeId: string }> },
) {
  const params = safeParams(await props.params);

  return createUpdate({
    updateFunction: async (email, body) => {
      return db.transaction(async (tx) => {
        const updated: z.infer<typeof CodebookNodeUpdateResponseSchema> = { node: { id: params.codebookNodeId } };

        // This way, if position is given as an integer and overlaps with an existing position,
        // make sure the updated node always comes before the existing node
        if (body.position !== undefined) body.position = body.position - 0.0001;

        const [updatedCodebookNode] = await tx
          .update(codebookNodes)
          .set({ ...body })
          .where(eq(codebookNodes.id, params.codebookNodeId))
          .returning();

        // We return everything that changed to enable client side updates
        if (body.name) updated.node.name = updatedCodebookNode.name;
        if (body.data) updated.node.data = body.data;

        const positionChanged = body.position !== undefined;
        const parentChanged = body.parentId !== undefined;
        const typeChanged = body.data?.type !== undefined;
        if (positionChanged || parentChanged || typeChanged) {
          // RE-INDEX TREE AND VALIDATION
          const tree = await reIndexCodebookTree(tx, params.jobId);

          if (createsCycle(tree, params.codebookNodeId)) throw new Error("Cycle detected in codebook");

          const i = tree.findIndex((node) => node.id === params.codebookNodeId);
          if (i === -1) throw new Error("Codebook node not found");

          const parent = tree.find((node) => node.id === body.parentId);

          if (!isValidParent(tree[i].type, parent?.type || null))
            throw new Error(`Invalid parent type: ${parent?.type || "root"} cannot be parent of ${tree[i].type}`);

          updated.tree = tree.map((node) => ({ id: node.id, parentId: node.parentId, position: node.position }));
        }

        return updated;
      });
    },
    req,
    bodySchema: CodebookNodeUpdateSchema,
    responseSchema: CodebookNodeUpdateResponseSchema,
    projectId: params.projectId,
    authorizeFunction: async (auth, body) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: number; jobId: string; codebookNodeId: string }> },
) {
  const params = safeParams(await props.params);

  return createDelete({
    deleteFunction: (email, urlParams) => {
      return db.transaction(async (tx) => {
        if (urlParams.recursive) {
          const nodes = await tx
            .select({
              id: codebookNodes.id,
              parentId: codebookNodes.parentId,
            })
            .from(codebookNodes)
            .where(eq(codebookNodes.jobId, params.jobId));

          const allChildren = getRecursiveChildren(nodes, params.codebookNodeId);
          const childIds = allChildren.map((child) => child.id);
          await tx.delete(codebookNodes).where(inArray(codebookNodes.id, childIds)).returning();
        }

        await tx.delete(codebookNodes).where(eq(codebookNodes.id, params.codebookNodeId)).returning();

        return { success: true };
      });
    },
    req,
    projectId: params.projectId,
    paramsSchema: CodebookNodeDeleteSchema,
    authorizeFunction: async (auth) => {
      if (!hasMinProjectRole(auth.projectRole, "manager")) return { message: "Unauthorized" };
    },
  });
}
