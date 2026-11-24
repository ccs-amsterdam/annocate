import { useMemo, useState } from "react";
import type { RoleColumn, UnitField } from "@annotinder/contracts";
import { assignAllColumns, initialMapping, mappingProblems, parseCsv, type ColumnMapping } from "../../../../admin/csv";
import { csvUpload, detectColumns, type CsvFile, type CsvUpload } from "../../../../admin/uploadUnits";

/** How the chosen file's columns are uploaded, and what that makes. */
export interface CsvMapping {
  /** The chosen file; null: none yet. */
  csv: CsvFile | null;
  /** Why the chosen file can't be used. */
  fileError: string | null;
  /** The column with the units' ids; -1: none chosen. */
  idColumn: number;
  mapping: ColumnMapping[];
  /** Columns with a role: column -> the role column it is. */
  roles: Record<number, RoleColumn>;
  /** What is wrong with each column's mapping (null: nothing). */
  problems: (string | null)[];
  /** The units the file makes (with `errors` that block them); null without a file. */
  result: CsvUpload | null;
  openFile: (file: File) => Promise<void>;
  closeFile: () => void;
  /** Every column not uploaded yet gets its own (valid) name. */
  useColumnNames: () => void;
  /** No column is uploaded as a field. */
  clearFields: () => void;
  setColumn: (column: number, next: Partial<ColumnMapping>) => void;
  /** The column is this role column (null: no longer one). */
  setRole: (column: number, role: RoleColumn | null) => void;
  /** The column is (or is no longer) the units' ids. */
  setId: (column: number, isId: boolean) => void;
}

/**
 * The state of a CSV upload's form: the file, which column is the units' id,
 * which columns have a role, and as which field and type the others are
 * uploaded. The id column and role columns are not also fields.
 */
export function useCsvMapping(studyFields: UnitField[]): CsvMapping {
  const [csv, setCsv] = useState<CsvFile | null>(null);
  const [idColumn, setIdColumn] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [roles, setRoles] = useState<Record<number, RoleColumn>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const result = useMemo(
    () => (csv ? csvUpload(csv, idColumn, mapping, roles, studyFields) : null),
    [csv, idColumn, mapping, roles, studyFields],
  );

  const setColumn = (column: number, next: Partial<ColumnMapping>) =>
    setMapping((current) => current.map((m) => (m.column === column ? { ...m, ...next } : m)));
  const withoutRole = (column: number) => {
    const next = { ...roles };
    delete next[column];
    return next;
  };

  async function openFile(file: File) {
    setFileError(null);
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setFileError(`${file.name} has no rows: a CSV needs a header row and at least one row of units.`);
      return;
    }
    const detected = detectColumns(parsed.headers);
    setCsv({ name: file.name, headers: parsed.headers, rows: parsed.rows, hints: parsed.hints });
    setRoles(detected.roles);
    setIdColumn(detected.idColumn);
    setMapping(
      initialMapping(parsed.headers, parsed.rows, studyFields).map((m) =>
        m.column === detected.idColumn || m.column in detected.roles ? { ...m, field: "" } : m,
      ),
    );
  }

  return {
    csv,
    fileError,
    idColumn,
    mapping,
    roles,
    problems: csv ? mappingProblems(csv.rows, mapping, studyFields) : [],
    result,
    openFile,
    closeFile: () => setCsv(null),
    useColumnNames: () => {
      if (!csv) return;
      const named = assignAllColumns(csv.headers, csv.rows, mapping, studyFields, idColumn);
      setMapping(named.map((m) => (m.column in roles ? { ...m, field: "" } : m)));
    },
    clearFields: () => setMapping(mapping.map((m) => ({ ...m, field: "" }))),
    setColumn,
    setRole: (column, role) => {
      setRoles(role === null ? withoutRole(column) : { ...roles, [column]: role });
      if (role !== null) setColumn(column, { field: "" });
    },
    setId: (column, isId) => {
      if (!isId) return setIdColumn(-1);
      setIdColumn(column);
      setColumn(column, { field: "" });
      setRoles(withoutRole(column));
    },
  };
}
