import db from "@/drizzle/drizzle";
import { variableAnnotations } from "@/drizzle/schema";
import { z } from "zod";
import { PostAnnotationUpdateSchema } from "../schemas";
import { Annotation, AnnotationDictionary, VariableAnnotations } from "@/app/types";
import { sql } from "drizzle-orm";

type UpdateVariableAnnotations = {
  annotatorSessionId: number;
  unitId: number | null;
  variableId: number;
  done?: boolean;
  skip?: boolean;
  annotations?: Annotation[];
};

async function upsertVariableAnnotations(body: z.infer<typeof PostAnnotationUpdateSchema>) {
  const values: UpdateVariableAnnotations[] = [];
  const { sessionId } = parseSessionToken(body.sessionToken);
  for (let [phaseToken, variables] of Object.entries(body.phaseAnnotations)) {
    const { unitId } = parsePhaseToken(phaseToken);
    for (let [variableId, variableAnnotations] of Object.entries(variables)) {
      const update: UpdateVariableAnnotations = {
        annotatorSessionId: sessionId,
        unitId: unitId,
        variableId: parseInt(variableId),
      };

      if (variableAnnotations.done !== undefined) update.done = variableAnnotations.done;
      if (variableAnnotations.skip !== undefined) update.skip = variableAnnotations.skip;
      if (variableAnnotations.annotations) update.annotations = variableAnnotations.annotations;
      values.push(update);
    }
  }

  await db
    .insert(variableAnnotations)
    .values(values)
    .onConflictDoUpdate({
      target: [variableAnnotations.annotatorSessionId, variableAnnotations.unitId, variableAnnotations.variableId],
      set: {
        annotations: sql`COALESCE(EXCLUDED.annotations, ${variableAnnotations.annotations})`,
        done: sql`COALESCE(EXCLUDED.done, ${variableAnnotations.done})`,
        skip: sql`COALESCE(EXCLUDED.skip, ${variableAnnotations.skip})`,
      },
    });
}

function parseSessionToken(sessionToken: string) {
  return { sessionId: 1 };
}

function parsePhaseToken(phaseToken: string) {
  return { unitId: 1 };
}
