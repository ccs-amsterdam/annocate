import { useGet } from "@/app/api/queryHelpers";
import { UnitColumnsResponseSchema } from "./schemas";
import { z } from "zod";

export function useColumns(projectId: number, unitsetId: number | undefined) {
  return useGet({
    resource: "column",
    endpoint: `projects/${projectId}/units/columns`,
    params: { unitsetId },
    responseSchema: z.array(UnitColumnsResponseSchema),
  });
}
