import { useRef, useState } from "react";
import type { UnitField } from "@annotinder/contracts";
import { AlertCircle } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCreateUnitsMutation } from "../../../admin/queries";
import { csvToUnits, parseCsv } from "../../../admin/csv";
import { Button } from "@/components/ui/button";
import { FieldBadge } from "./FieldBadge";

const BATCH = 200; // the most units per POST /units

/**
 * Uploading units from a CSV: pick the id column, see the fields and the
 * first rows as they will be stored (typed), then upload. The first upload
 * sets the job's fields (types inferred); later uploads must match them.
 */
export function UploadUnits({
  client,
  jobFields,
  onDone,
}: {
  client: ResearcherApi;
  jobFields: UnitField[];
  onDone: () => void;
}) {
  const createUnits = useCreateUnitsMutation(client);
  const [csv, setCsv] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [idColumn, setIdColumn] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const result = csv && idColumn ? csvToUnits(csv.headers, csv.rows, idColumn, jobFields) : null;
  const firstUpload = jobFields.length === 0;

  async function handleFile(file: File) {
    const parsed = parseCsv(await file.text());
    setCsv({ name: file.name, ...parsed });
    setIdColumn(parsed.headers.find((h) => /^(id|externalid|external_id)$/i.test(h)) ?? parsed.headers[0] ?? "");
  }

  async function upload() {
    if (!result) return;
    for (let i = 0; i < result.units.length; i += BATCH) {
      setProgress(i);
      await createUnits.mutateAsync({ overwrite, units: result.units.slice(i, i + BATCH) });
    }
    setProgress(null);
    onDone();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Upload units from CSV</h3>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {csv && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {csv.rows.length} rows. Id column:
            </span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={idColumn}
              onChange={(e) => setIdColumn(e.target.value)}
            >
              {csv.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {result && (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">
                  {firstUpload ? "Fields (types inferred from the values): " : "Fields: "}
                </span>
                <span className="inline-flex flex-wrap gap-1.5 align-middle">
                  {result.fields.map((f) => (
                    <FieldBadge key={f.name} field={f} />
                  ))}
                </span>
                {firstUpload && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    The first upload sets the job&apos;s fields; later uploads must have the same columns.
                  </p>
                )}
              </div>

              {result.errors.length > 0 ? (
                <ul className="space-y-1 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                  {result.errors.map((e) => (
                    <li key={e} className="flex gap-1.5">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              ) : (
                <PreviewRows fields={result.fields} units={result.units.slice(0, 5)} />
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                Replace existing units with the same id (only units nobody has coded yet)
              </label>
              <div className="flex items-center gap-3">
                <Button onClick={() => void upload()} disabled={result.errors.length > 0 || createUnits.isPending}>
                  {progress !== null
                    ? `Uploading ${progress} / ${result.units.length}...`
                    : `Upload ${result.units.length} units`}
                </Button>
                {createUnits.isError && <p className="text-sm text-destructive">{createUnits.error.message}</p>}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function PreviewRows({ fields, units }: { fields: UnitField[]; units: ReturnType<typeof csvToUnits>["units"] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            <th className="p-1.5 font-medium">id</th>
            {fields.map((f) => (
              <th key={f.name} className="p-1.5 font-medium">
                {f.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.externalId} className="border-b last:border-0">
              <td className="p-1.5 font-mono">{u.externalId}</td>
              {fields.map((f) => (
                <td key={f.name} className="max-w-48 truncate p-1.5">
                  {u.data[f.name] === null ? <span className="text-muted-foreground">empty</span> : String(u.data[f.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
