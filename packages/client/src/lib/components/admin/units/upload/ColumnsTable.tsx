import { ROLE_COLUMNS, isRoleColumn, type RoleColumn, type UnitField, type UnitFieldType } from "@annotinder/contracts";
import { AlertCircle, Check } from "lucide-react";
import type { ColumnMapping } from "../../../../admin/csv";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "../../../../admin/setKinds";
import type { CsvMapping } from "./useCsvMapping";

export const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

const TYPES: UnitFieldType[] = ["text", "number", "boolean", "list"];

/** The file's columns: per column a few values, as which field it is uploaded, and its type (or: the id, a role column). */
export function ColumnsTable({ csv, studyFields }: { csv: CsvMapping; studyFields: UnitField[] }) {
  const file = csv.csv;
  if (!file) return null;
  return (
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
          {csv.mapping.map((m, i) => (
            <ColumnRow
              key={m.column}
              header={file.headers[m.column]}
              samples={file.rows.slice(0, 3).map((r) => r[m.column] ?? "")}
              mapping={m}
              existing={studyFields.find((f) => f.name === m.field)}
              isId={m.column === csv.idColumn}
              role={csv.roles[m.column]}
              problem={csv.problems[i]}
              onChange={(next) => csv.setColumn(m.column, next)}
              onRole={(role) => csv.setRole(m.column, role)}
              onId={(isId) => csv.setId(m.column, isId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ColumnRowProps {
  header: string;
  samples: string[];
  mapping: ColumnMapping;
  /** The study's field this column is uploaded as, if it exists. */
  existing: UnitField | undefined;
  isId: boolean;
  /** For a column with a role: which one. */
  role: RoleColumn | undefined;
  problem: string | null;
  onChange: (next: Partial<ColumnMapping>) => void;
  /** This column is (or is no longer) the units' ids. */
  onId: (isId: boolean) => void;
  /** This column is this column with a role (null: no longer). */
  onRole: (role: RoleColumn | null) => void;
}

function ColumnRow(props: ColumnRowProps) {
  const { header, samples, mapping, isId, role } = props;
  const uploaded = mapping.field !== "" || role !== undefined;
  const tone = isId ? "bg-primary/5" : uploaded ? "" : "text-muted-foreground";
  return (
    <tr className={`border-b align-top last:border-0 ${tone}`}>
      <td className="p-1.5 font-medium">{header}</td>
      <td className="max-w-56 p-1.5">
        <span className="line-clamp-2 break-all">{samples.filter(Boolean).join(" · ") || "(empty)"}</span>
      </td>
      <td className="p-1.5">
        <UploadAs {...props} />
      </td>
      <td className="p-1.5">
        <ColumnType {...props} />
      </td>
      <td className="p-1.5">{(isId || uploaded) && <ColumnCheck {...props} />}</td>
    </tr>
  );
}

/** What the column is uploaded as: the units' id, a role column, or a field by its name. */
function UploadAs({ header, mapping, isId, role, onChange, onRole }: ColumnRowProps) {
  if (isId)
    return (
      <span className="inline-flex h-8 items-center text-xs text-primary" title="In a layout: $unit.id">
        each unit&apos;s id
      </span>
    );
  if (role !== undefined)
    return (
      <select
        aria-label={`Role of ${header}`}
        className={`${selectClass} font-mono`}
        value={role}
        onChange={(e) => onRole(e.target.value as RoleColumn)}
      >
        {ROLE_COLUMNS.map((c) => (
          <option key={c} value={c}>
            {c} ({ROLE_LABELS[c].toLowerCase()})
          </option>
        ))}
      </select>
    );
  return (
    <Input
      list="unit-field-names"
      className="h-8 w-44 text-xs"
      placeholder="not uploaded"
      value={mapping.field}
      onChange={(e) => onChange({ field: e.target.value.trim() })}
    />
  );
}

/** The column's type: unit id, a column with a role, or a field type (a field of the study keeps its type). */
function ColumnType({ header, mapping, existing, isId, role, onChange, onId, onRole }: ColumnRowProps) {
  const isRole = role !== undefined;
  if (existing && !isId && !isRole)
    return (
      <span
        className="inline-flex h-8 items-center gap-1 text-muted-foreground"
        title="A field of this study keeps its type"
      >
        {existing.type} <span className="text-[10px]">(existing field)</span>
      </span>
    );
  const choose = (value: string) => {
    if (value === "id") return onId(true);
    if (isId) onId(false);
    if (value === "sets") {
      const name = header.trim();
      return onRole(isRoleColumn(name) ? name : "coder_set");
    }
    if (isRole) onRole(null);
    onChange({ type: value as UnitFieldType });
  };
  return (
    <select
      aria-label={`Type of ${header}`}
      className={`${selectClass} ${isId ? "border-primary font-semibold text-primary" : ""}`}
      value={isId ? "id" : isRole ? "sets" : mapping.type}
      onChange={(e) => choose(e.target.value)}
    >
      <option value="id">unit id</option>
      <option value="sets">column with a role</option>
      {TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Whether an uploaded column is fine, or what is wrong with it (a role column's problems are listed below the table). */
function ColumnCheck({ isId, role, problem }: ColumnRowProps) {
  if (problem && !isId && role === undefined)
    return (
      <span className="flex items-start gap-1 text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {problem}
      </span>
    );
  return <Check className="mt-1.5 h-3.5 w-3.5 text-primary" aria-label="OK" />;
}
