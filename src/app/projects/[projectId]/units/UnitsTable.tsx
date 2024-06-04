import { useCreateUnits, useUnits } from "@/app/api/projects/[projectId]/units/query";
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
import { ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCSVReader } from "react-papaparse";
import { z } from "zod";

interface Props {
  projectId: number;
}

const COLUMNS = ["collection", "id"];

export function UnitsTable({ projectId }: Props) {
  const useUnitsProps = useUnits(projectId);
  const [unit, setUnit] = useState<z.infer<typeof UnitDataResponseSchema>>();
  const router = useRouter();

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
      <CreateUnitsButton projectId={projectId} />
      <div className="mt-8 w-full">
        <DBTable {...useUnitsProps} onSelect={onSelect} columns={COLUMNS} />
      </div>
      <SimpleDialog open={!!unit} setOpen={(open) => !open && setUnit(undefined)} header={``} className="max-w-[800px]">
        {showUnit()}
      </SimpleDialog>
    </div>
  );
}

type CellValue = z.infer<typeof UnitDataValueSchema>;
type Rows = Record<string, CellValue>[];
type Columns = string[];
type Data = { columns: Columns; rows: Rows; possibleId: string[]; id: string; collection: string; overwrite: boolean };
type UploadProgress = {
  i: number;
  total: number;
  overwrite: boolean;
  batches: z.infer<typeof UnitDataRowSchema>[][];
};

function CreateUnitsButton({ projectId: projectId }: Props) {
  const [open, setOpen] = useState(false);
  const { mutateAsync } = useCreateUnits(projectId);
  const [data, setData] = useState<Data | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const { CSVReader } = useCSVReader();

  async function startUpload(data: Data) {
    const overwrite = data.overwrite;
    const batches: z.infer<typeof UnitDataRowSchema>[][] = [];
    const rows = data.rows.map((row) => ({
      collection: data.collection,
      id: String(row[data.id]),
      data: row,
    }));

    const batchsize = 100;
    for (let i = 0; i < rows.length; i += batchsize) {
      batches.push(rows.slice(i, i + batchsize));
    }

    setProgress({ i: 0, total: batches.length, overwrite, batches });
  }

  useEffect(() => {
    if (!progress) return;
    const batch = progress.batches[progress.i];
    mutateAsync({ overwrite: progress.overwrite, units: batch })
      .then(() => {
        if (progress.i === progress.total - 1) {
          setProgress(null);
          setOpen(false);
        } else {
          setProgress({ ...progress, i: progress.i + 1 });
        }
      })
      .catch((e) => {
        console.error(e);
        setProgress(null);
      });
  }, [progress, mutateAsync]);

  useEffect(() => {
    if (!open) setData(null);
  }, [open, setData]);

  function readData(columns: string[], rows: (string | number | boolean)[][]) {
    const dataObj = rows.map((row) => {
      const obj: any = {};
      row.forEach((value, i: number) => {
        obj[columns[i]] = value;
      });
      return obj;
    });
    const possibleId: string[] = [];
    columns.forEach((col) => {
      const values = dataObj.map((row) => String(row[col]));
      if (values.length === new Set(values).size) {
        possibleId.push(col);
      }
    });
    setData({ columns, rows: dataObj, possibleId, id: "", collection: "", overwrite: false });
  }

  function renderForm() {
    if (!data) return null;
    if (data.possibleId.length === 0)
      return <Label>Data needs to have a column with unique values to serve as an ID</Label>;
    return (
      <div className="flex w-full flex-col gap-3">
        {/* <Button variant="destructive" className="mr-auto " type="button" onClick={() => setData(null)}>
          Reset
        </Button> */}

        <div className="grid grid-cols-[1.2fr,1fr] items-center justify-between gap-3">
          <label className="">Select unique ID column</label>
          <SelectIdDropdown data={data} setData={setData} />
          <label className="">Set collection label</label>
          <Input
            className="min-w-0"
            placeholder="Collection"
            value={data.collection}
            onChange={(e) => setData({ ...data, collection: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={data.overwrite}
              onCheckedChange={(checked) => setData({ ...data, overwrite: !!checked })}
              id="overwrite"
              className="h-5 w-5"
            />
            <label htmlFor="overwrite">Overwrite if ID exists</label>
          </div>
          <Button
            disabled={!data.id || !data.collection}
            className=" flex  w-min gap-1"
            variant="secondary"
            onClick={() => startUpload(data)}
          >
            <Plus />
          </Button>
        </div>
      </div>
    );
  }

  if (progress) {
    return (
      <SimpleDialog open={true} header="Uploading units">
        <div className="flex flex-col gap-6">
          <Progress value={(100 * progress.i) / progress.total} />
          <Button className="ml-auto" variant="destructive" onClick={() => setProgress(null)}>
            Cancel
          </Button>
        </div>
      </SimpleDialog>
    );
  }

  return (
    <SimpleDialog
      open={open}
      setOpen={setOpen}
      header="Upload units"
      trigger={
        <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
          Upload units
          <Plus className="h-5 w-5" />
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <CSVReader
          onUploadAccepted={(results: any) => {
            readData(results.data[0], results.data.slice(1));
          }}
        >
          {({ getRootProps, acceptedFile, ProgressBar, getRemoveFileProps }: any) => {
            return (
              <Button className={`mt-6 w-full ${data ? "hidden" : ""}`} type="button" {...getRootProps()}>
                Select CSV
              </Button>
            );
          }}
        </CSVReader>
        {renderForm()}
      </div>
    </SimpleDialog>
  );
}

function SelectIdDropdown({ data, setData }: { data: Data; setData: (data: Data) => void }) {
  if (!data) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="flex items-center justify-start gap-2">
          {data.id ? data.id : "Select ID"} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {data.possibleId.map((col) => {
          return (
            <DropdownMenuItem key={col} onClick={() => setData({ ...data, id: col })}>
              {col}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
