import { UnitLayoutSchema } from "@/app/api/projects/[projectId]/units/layouts/schemas";
import { UnitDataResponseSchema } from "@/app/api/projects/[projectId]/units/schemas";
import { RawUnit, Unit } from "@/app/types";
import { z } from "zod";

type UnitData = z.infer<typeof UnitDataResponseSchema>;
type Layout = z.infer<typeof UnitLayoutSchema>;

export function applyUnitLayout(unit: UnitData, layout: Layout, index: number): RawUnit {
  return {
    index,
    status: "IN_PROGRESS",
    id: unit.id,
    type: "code",
    unit: {},
  };
}
