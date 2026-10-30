import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { UnitField, UnitFieldType } from "@annotinder/contracts";
import { AlertCircle, Check, FileUp, Wand2 } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCreateUnitsMutation, useUnitsQuery } from "../../../admin/queries";
import { assignAllColumns, csvToUnits, initialMapping, mappingProblems, parseCsv, type ColumnMapping, type CsvUnits } from "../../../admin/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldBadge } from "./FieldBadge";
import { HelpButton } from "../../../help/HelpButton";

const BATCH = 200; // the most units per POST /units
const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

interface Csv {
  name: string;
  headers: string[];
  rows: string[][];
}

/**
 * Uploading units from a CSV (docs/client.md §7, "Units"): choose a file,
 * then per column whether and as which field it is uploaded, and its type.
 * Columns named like a field of the job are linked to it (and keep its
 * type); "Use column names" gives every other column its own (valid) name.
 * Values are checked against the types before anything is uploaded.
 */
export function UploadUnits({ client, jobFields, onDone }: { client: ResearcherApi; jobFields: UnitField[]; onDone: () => void }) {
  const createUnits = useCreateUnitsMutation(client);
  const existingUnits = useUnitsQuery(client).data ?? [];
  const [overwriteCoded, setOverwriteCoded] = useState(false);
  const [result, setResult] = useState<CsvUnits | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  // Units that already exist (by id), and which of those were coded.
  const byId = new Map(existingUnits.map((u) => [u.externalId, u]));
  const replaced = result ? result.units.filter((u) => byId.has(u.externalId)) : [];
  const coded = replaced.filter((u) => byId.get(u.externalId)!.coded);

  async function upload() {
    if (!result) return;
    for (let i = 0; i < result.units.length; i += BATCH) {
      setProgress(i);
      await createUnits.mutateAsync({ overwrite, overwriteCoded: overwrite && overwriteCoded, units: result.units.slice(i, i + BATCH) });
    }
    setProgress(null);
    onDone();
  }

  return (
    <Section onCancel={onDone}>
      <CsvUnitsForm jobFields={jobFields} onResult={setResult} />
      {result && replaced.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Replace the {replaced.length} unit{replaced.length === 1 ? "" : "s"} that already exist{replaced.length === 1 ? "s" : ""} (same id)
        </label>
      )}
      {overwrite && coded.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm">
          <p className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {coded.length} of them {coded.length === 1 ? "was" : "were"} already coded. Replacing a coded unit harms
              provenance: later coders see other content than earlier ones. Earlier answers keep the version their coder
              saw (it is in the data download), but span annotations may no longer fit the new text.
            </span>
          </p>
          <label className="flex items-center gap-2 pl-6">
            <input type="checkbox" checked={overwriteCoded} onChange={(e) => setOverwriteCoded(e.target.checked)} />
            Also replace the {coded.length} coded unit{coded.length === 1 ? "" : "s"}
          </label>
        </div>
      )}
      {result && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => void upload()}
            disabled={
              result.errors.length > 0 ||
              createUnits.isPending ||
              (replaced.length > 0 && !overwrite) ||
              (overwrite && coded.length > 0 && !overwriteCoded)
            }
          >
            {progress !== null ? `Uploading ${progress} / ${result.units.length}...` : `Upload ${result.units.length} units`}
          </Button>
          {createUnits.isError && <p className="text-sm text-destructive">{createUnits.error.message}</p>}
        </div>
      )}
    </Section>
  );
}

/**
 * The CSV part of an upload: the file, the id column, and per column
 * whether and as which field it is uploaded, with the checks and a
 * preview. `onResult`: the units it makes (with `errors` that block them),
 * or null without a file. Also the setup wizard's units step.
 */
export function CsvUnitsForm({ jobFields, onResult }: { jobFields: UnitField[]; onResult: (result: CsvUnits | null) => void }) {
  const [csv, setCsv] = useState<Csv | null>(null);
  const [idColumn, setIdColumn] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const result = useMemo(() => {
    if (!csv) return null;
    // One column is the units' ids (its type in the table)
    if (idColumn < 0) return { fields: [], units: [], errors: ["Choose the column with each unit's id: set its type to Unit id"] };
    return csvToUnits(csv.headers, csv.rows, idColumn, mapping, jobFields);
  }, [csv, idColumn, mapping, jobFields]);
  useEffect(() => onResult(result), [result, onResult]);

  async function handleFile(file: File) {
    setFileError(null);
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setFileError(`${file.name} has no rows: a CSV needs a header row and at least one row of units.`);
      return;
    }
    setCsv({ name: file.name, ...parsed });
    const id = parsed.headers.findIndex((h) => /^(id|externalid|external_id)$/i.test(h.trim()));
    const idAt = Math.max(0, id);
    setIdColumn(idAt);
    setMapping(initialMapping(parsed.headers, parsed.rows, jobFields).map((m) => (m.column === idAt ? { ...m, field: "" } : m)));
  }

  if (!csv || !result) {
    return (
      <>
        <FilePicker onFile={(f) => void handleFile(f)} />
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
        <p className="text-xs text-muted-foreground">
          A CSV file with a header row: one column with a unique id per unit, and the columns to code (e.g. a headline
          and a text).
        </p>
      </>
    );
  }

  const problems = mappingProblems(csv.rows, mapping, jobFields);
  const mapped = new Set(mapping.map((m) => m.field).filter(Boolean));
  const unmappedFields = jobFields.filter((f) => !mapped.has(f.name));
  const setColumn = (i: number, next: Partial<ColumnMapping>) => setMapping(mapping.map((m, j) => (j === i ? { ...m, ...next } : m)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <FileUp className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{csv.name}</span>
          <span className="text-muted-foreground">({csv.rows.length} rows)</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => setCsv(null)}>
          Choose another file
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Columns to upload</h4>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setMapping(assignAllColumns(csv.headers, csv.rows, mapping, jobFields, idColumn))}>
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Use column names
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMapping(mapping.map((m) => ({ ...m, field: "" })))}>
              Clear
            </Button>
          </div>
        </div>
        <datalist id="unit-field-names">
          {jobFields.map((f) => (
            <option key={f.name} value={f.name} />
          ))}
        </datalist>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="p-1.5 font-medium">Column</th>
                <th className="p-1.5 font-medium">Values</th>
                <th className="p-1.5 font-medium">Upload as field</th>
                <th className="p-1.5 font-medium">Type</th>
                <th className="p-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {mapping.map((m, i) => (
                <ColumnRow
                  key={m.column}
                  header={csv.headers[m.column]}
                  samples={csv.rows.slice(0, 3).map((r) => r[m.column] ?? "")}
                  mapping={m}
                  existing={jobFields.find((f) => f.name === m.field)}
                  isId={m.column === idColumn}
                  problem={problems[i]}
                  onChange={(next) => setColumn(i, next)}
                  onId={(isId) => {
                    // The id column isn't also a field ($unit.id is its value in a layout)
                    if (isId) {
                      setIdColumn(m.column);
                      setColumn(i, { field: "" });
                    } else setIdColumn(-1);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
        {unmappedFields.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No column is uploaded as {unmappedFields.map((f) => f.name).join(", ")}: these units get empty values there.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Field names: letters, digits and _, so a codebook can show them as <code>$unit.name</code>. A column named like a
          field of this job is uploaded as that field, with its type.
        </p>
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
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Fields:</span>
            {result.fields.map((f) => (
              <FieldBadge key={f.name} field={f} />
            ))}
          </div>
          <PreviewRows fields={result.fields} units={result.units.slice(0, 5)} />
        </div>
      )}
    </>
  );
}

function Section({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          Upload units from CSV <HelpButton topic="uploading-units" label="Help: uploading units" />
        </h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {children}
    </section>
  );
}

/** A drop zone with a button: the browser's file input stays hidden. */
function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
        over ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <FileUp className="h-6 w-6 text-muted-foreground" />
      <Button onClick={() => input.current?.click()}>Choose a CSV file</Button>
      <span className="text-xs text-muted-foreground">or drop it here</span>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const TYPES: UnitFieldType[] = ["text", "number", "boolean"];

function ColumnRow({
  header,
  samples,
  mapping,
  existing,
  isId,
  problem,
  onChange,
  onId,
}: {
  header: string;
  samples: string[];
  mapping: ColumnMapping;
  /** The job's field this column is uploaded as, if it exists. */
  existing: UnitField | undefined;
  isId: boolean;
  problem: string | null;
  onChange: (next: Partial<ColumnMapping>) => void;
  /** This column is (or is no longer) the units' ids. */
  onId: (isId: boolean) => void;
}) {
  const uploaded = mapping.field !== "";
  return (
    <tr className={`border-b align-top last:border-0 ${isId ? "bg-primary/5" : uploaded ? "" : "text-muted-foreground"}`}>
      <td className="p-1.5 font-medium">{header}</td>
      <td className="max-w-56 p-1.5">
        <span className="line-clamp-2 break-all">{samples.filter(Boolean).join(" · ") || "(empty)"}</span>
      </td>
      <td className="p-1.5">
        {isId ? (
          <span className="inline-flex h-8 items-center text-xs text-primary" title="In a layout: $unit.id">
            each unit&apos;s id
          </span>
        ) : (
          <Input
            list="unit-field-names"
            className="h-8 w-44 text-xs"
            placeholder="not uploaded"
            value={mapping.field}
            onChange={(e) => onChange({ field: e.target.value.trim() })}
          />
        )}
      </td>
      <td className="p-1.5">
        {existing && !isId ? (
          <span className="inline-flex h-8 items-center gap-1 text-muted-foreground" title="A field of this job keeps its type">
            {existing.type} <span className="text-[10px]">(existing field)</span>
          </span>
        ) : (
          <select
            aria-label={`Type of ${header}`}
            className={`${selectClass} ${isId ? "border-primary font-semibold text-primary" : ""}`}
            value={isId ? "id" : mapping.type}
            onChange={(e) => {
              if (e.target.value === "id") return onId(true);
              if (isId) onId(false);
              onChange({ type: e.target.value as UnitFieldType });
            }}
          >
            <option value="id">unit id</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="p-1.5">
        {isId && <Check className="mt-1.5 h-3.5 w-3.5 text-primary" aria-label="OK" />}
        {uploaded &&
          !isId &&
          (problem ? (
            <span className="flex items-start gap-1 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {problem}
            </span>
          ) : (
            <Check className="mt-1.5 h-3.5 w-3.5 text-primary" aria-label="OK" />
          ))}
      </td>
    </tr>
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
                  {u.data[f.name] === null || u.data[f.name] === undefined ? (
                    <span className="text-muted-foreground">empty</span>
                  ) : (
                    String(u.data[f.name])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
