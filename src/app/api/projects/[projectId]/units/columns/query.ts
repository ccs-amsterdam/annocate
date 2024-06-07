import { useGet } from "@/app/api/queryHelpers";
import { UnitColumnsResponseSchema } from "./schemas";
import { z } from "zod";

export function useColumns(projectId: number, unitsets: string[] | undefined) {
  return useGet({
    resource: "column",
    endpoint: `projects/${projectId}/units/columns`,
    params: { unitsets },
    responseSchema: z.array(UnitColumnsResponseSchema),
  });
}
