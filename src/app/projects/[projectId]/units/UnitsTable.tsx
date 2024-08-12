import { useUnits } from "@/app/api/projects/[projectId]/units/query";
import { UnitDataResponseSchema } from "@/app/api/projects/[projectId]/units/schemas";
import DBTable from "@/components/Common/DBTable";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { useState } from "react";
import { z } from "zod";

interface Props {
  projectId: number;
}

const COLUMNS = ["data"];

export function UnitsTable({ projectId }: Props) {
  const useUnitsProps = useUnits(projectId, { pageSize: 7 });
  const [unit, setUnit] = useState<z.infer<typeof UnitDataResponseSchema>>();

  function onSelect(row: z.infer<typeof UnitDataResponseSchema>) {
    // router.push(`/projects/${projectId}/codebooks/${row.id}`);
    setUnit(row);
  }

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

  return (
    <div>
      <div className="mt-8 w-full">
        <DBTable {...useUnitsProps} onSelect={onSelect} columns={COLUMNS} />
      </div>
      <SimpleDialog open={!!unit} setOpen={(open) => !open && setUnit(undefined)} header={``} className="max-w-[800px]">
        {showUnit()}
      </SimpleDialog>
    </div>
  );
}
