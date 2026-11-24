import { useEffect } from "react";
import type { UnitField } from "@annotinder/contracts";
import { AlertCircle, FileUp, Wand2 } from "lucide-react";
import type { CsvFile, CsvUpload } from "../../../../admin/uploadUnits";
import { Button } from "@/components/ui/button";
import { FieldBadge } from "../FieldBadge";
import { FilePicker } from "./FilePicker";
import { ColumnsTable } from "./ColumnsTable";
import { PreviewRows } from "./PreviewRows";
import { useCsvMapping, type CsvMapping } from "./useCsvMapping";

/**
 * The CSV part of an upload: the file, the id column, and per column
 * whether and as which field it is uploaded, with the checks and a
 * preview. `onResult`: the units it makes (with `errors` that block them),
 * or null without a file. Columns named like a column with a role (coder_set,
 * condition_set, part_set, test_set) are that column.
 */
export function CsvUnitsForm({
  studyFields,
  onResult,
}: {
  studyFields: UnitField[];
  onResult: (result: CsvUpload | null) => void;
}) {
  const csv = useCsvMapping(studyFields);
  const { result } = csv;
  useEffect(() => onResult(result), [result, onResult]);

  if (!csv.csv || !result) {
    return (
      <>
        <FilePicker onFile={(f) => void csv.openFile(f)} />
        {csv.fileError && <p className="text-sm text-destructive">{csv.fileError}</p>}
        <p className="text-xs text-muted-foreground">
          A CSV file with a header row: one column with a unique id per unit, and the columns to code (e.g. a headline
          and a text).
        </p>
      </>
    );
  }

  return (
    <>
      <ChosenFile file={csv.csv} onClose={csv.closeFile} />
      <ColumnsToUpload csv={csv} studyFields={studyFields} />
      {result.errors.length > 0 ? <UploadErrors errors={result.errors} /> : <UploadPreview result={result} />}
    </>
  );
}

/** The chosen file: its name, how many rows, and what to know about how it was read. */
function ChosenFile({ file, onClose }: { file: CsvFile; onClose: () => void }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <FileUp className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{file.name}</span>
          <span className="text-muted-foreground">({file.rows.length} rows)</span>
        </span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Choose another file
        </Button>
      </div>
      {file.hints.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
          {file.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The columns with how each is uploaded, and what the names and roles mean. */
function ColumnsToUpload({ csv, studyFields }: { csv: CsvMapping; studyFields: UnitField[] }) {
  const mapped = new Set(csv.mapping.map((m) => m.field).filter(Boolean));
  const unmappedFields = studyFields.filter((f) => !mapped.has(f.name));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Columns to upload</h4>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={csv.useColumnNames}>
            <Wand2 className="mr-1 h-3.5 w-3.5" /> Use column names
          </Button>
          <Button size="sm" variant="ghost" onClick={csv.clearFields}>
            Clear
          </Button>
        </div>
      </div>
      <datalist id="unit-field-names">
        {studyFields.map((f) => (
          <option key={f.name} value={f.name} />
        ))}
      </datalist>
      <ColumnsTable csv={csv} studyFields={studyFields} />
      {unmappedFields.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No column is uploaded as {unmappedFields.map((f) => f.name).join(", ")}: these units get empty values there.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Field names: letters, digits and _, so a design can show them as <code>$unit.name</code>. A column named like a
        field of this study is uploaded as that field, with its type. Columns with a role: <code>coder_set</code> (who
        codes a unit: <code>anna</code> or <code>anna;bob</code>), <code>condition_set</code> (the experiment&apos;s
        conditions), <code>part_set</code> (e.g. <code>pre</code>, <code>post</code>), optionally with a position (
        <code>anna#3</code>); and <code>test_set</code> (<code>overlap</code>, <code>practice</code> or{" "}
        <code>gold</code>). A column with such a name is one; uploading it replaces what it had.
      </p>
    </div>
  );
}

function UploadErrors({ errors }: { errors: string[] }) {
  return (
    <ul className="space-y-1 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
      {errors.map((e) => (
        <li key={e} className="flex gap-1.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {e}
        </li>
      ))}
    </ul>
  );
}

/** The fields the units will have, and the first units. */
function UploadPreview({ result }: { result: CsvUpload }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Fields:</span>
        {result.fields.map((f) => (
          <FieldBadge key={f.name} field={f} />
        ))}
      </div>
      <PreviewRows fields={result.fields} units={result.units.slice(0, 5)} />
    </div>
  );
}
