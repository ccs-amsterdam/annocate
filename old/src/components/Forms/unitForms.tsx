import { useCreateUnits } from "@/app/api/projects/[projectId]/jobs/[jobId]/units/query";
import { UnitDataRowSchema, UnitDataValueSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/units/schemas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { ChevronDown, Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { useCSVReader } from "react-papaparse";
import { z } from "zod";

type Value = z.infer<typeof UnitDataValueSchema>;
type Rows = Record<string, Value>[];
type Columns = string[];
type Data = {
  columns: Columns;
  rows: Rows;
  possibleId: string[];
  id: string;
  overwrite: boolean;
  unitsetId?: number;
};
type DataRow = z.infer<typeof UnitDataRowSchema>;
type UploadProgress = {
  i: number;
  total: number;
  overwrite: boolean;
  batches: DataRow[][];
};

export function CreateUnitsButton({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync } = useCreateUnits(projectId);
  const [data, setData] = useState<Data | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const { CSVReader } = useCSVReader();

  async function startUpload(data: Data) {
    const batches: DataRow[][] = [];

    let rows: DataRow[] = [];
    data.rows.forEach((row) => {
      const id = row[data.id];
      if (id) rows.push({ id: String(id), data: row });
    });

    const batchsize = 100;
    for (let i = 0; i < rows.length; i += batchsize) {
      batches.push(rows.slice(i, i + batchsize));
    }

    setProgress({ i: 0, total: batches.length, batches, overwrite: data.overwrite });
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
      for (let value of values) {
        if (value.length > 256) return;
      }
      if (values.length === new Set(values).size) {
        possibleId.push(col);
      }
    });
    setData({
      columns,
      rows: dataObj,
      possibleId,
      id: "",
      overwrite: false,
    });
  }

  // function SelectLayout() {
  //   if (!data?.unitset || data.unitsetExists) return null;
  //   return (
  //     <>
  //       <label>
  //         {data.unitset ? (data.unitsetExists ? "Select layout" : "Create new layout") : "Select or create layout"}
  //       </label>
  //       <SelectOrCreate
  //         options={layouts || []}
  //         optionKey="name"
  //         createMessage="Create new layout"
  //         placeholder="New or existing"
  //         value={data.layout}
  //         onValueChange={(option, value) => setData({ ...data, layout: value })}
  //       />
  //     </>
  //   );
  // }

  function renderForm() {
    if (!data) return null;
    if (data.possibleId.length === 0)
      return (
        <p>
          Invalid data. We require you to specify an ID column yourself, to ensure that you can link annotations back to
          your units. An ID column has to have unique values of at most 256 characters. This data does not have a column
          that meets these requirements.
        </p>
      );

    const ready = !!data.id;

    return (
      <div className="flex w-full flex-col gap-3">
        <div className="grid grid-cols-[1.2fr,1fr] items-center justify-between gap-3">
          <label className="">Select unique ID column</label>
          <SelectIdDropdown data={data} setData={setData} />
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
          <Button disabled={!ready} className="flex w-min gap-1" variant="secondary" onClick={() => startUpload(data)}>
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
      header="Create units"
      trigger={
        <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2">
          Create units
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
        <Button variant={data.id ? "default" : "outline"} className="flex items-center justify-start gap-2">
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
