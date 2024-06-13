import { useUnitsets, useCreateUnits, useUnits, useDeleteUnitsets } from "@/app/api/projects/[projectId]/units/query";
import {
  UnitDataResponseSchema,
  UnitDataRowSchema,
  UnitDataValueSchema,
} from "@/app/api/projects/[projectId]/units/schemas";
import DBTable from "@/components/Common/DBTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { useUnit } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { ChevronDown, Plus, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCSVReader } from "react-papaparse";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";
import { CreateUnitsButton, DeleteUnitsets } from "@/components/Forms/unitForms";

interface Props {
  projectId: number;
}

const COLUMNS = ["id"];

export function UnitsTable({ projectId }: Props) {
  const useUnitsProps = useUnits(projectId, {});
  const { data: unitsets, isLoading: unitsetsLoading } = useUnitsets(projectId, {});
  const [unit, setUnit] = useState<z.infer<typeof UnitDataResponseSchema>>();
  const [editSetList, setEditSetList] = useState<number[]>([]);
  const router = useRouter();

  function onSelect(row: z.infer<typeof UnitDataResponseSchema>) {
    // router.push(`/projects/${projectId}/codebooks/${row.id}`);
    setUnit(row);
  }

  useEffect(() => setEditSetList([]), [unitsets]);

  function showUnit() {
    if (!unit) return null;
    return (
      <div className="prose flex max-w-full flex-col  dark:prose-invert">
        {Object.entries(unit.data).map(([key, value]) => {
          return (
            <div key={key} className="">
              <h3>{key}</h3>
              <div>{value}</div>
            </div>
          );
        })}
      </div>
    );
  }

  function toggleEditList(unitsetId: number) {
    if (editSetList.includes(unitsetId)) {
      setEditSetList(editSetList.filter((id) => id !== unitsetId));
    } else {
      setEditSetList([...editSetList, unitsetId]);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {(unitsets || []).map((unitset) => {
          return (
            <div key={unitset.name} className="flex items-start gap-1">
              <Button
                variant={editSetList.includes(unitset.id) ? "secondary" : "outline"}
                className={`border-2 border-secondary px-2 py-1`}
                onClick={() => toggleEditList(unitset.id)}
              >
                {unitset.name}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <CreateUnitsButton projectId={projectId} />
        <DeleteUnitsets projectId={projectId} editSetList={editSetList} />
      </div>
      <div className="mt-8 w-full">
        <DBTable {...useUnitsProps} onSelect={onSelect} columns={COLUMNS} />
      </div>
      <SimpleDialog open={!!unit} setOpen={(open) => !open && setUnit(undefined)} header={``} className="max-w-[800px]">
        {showUnit()}
      </SimpleDialog>
    </div>
  );
}
