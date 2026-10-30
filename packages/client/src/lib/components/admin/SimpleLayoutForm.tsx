import { useId } from "react";
import type { SimpleLayout } from "../../codebook/simpleLayout";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

/**
 * Which field is a unit's title, byline and body (codebook/simpleLayout.ts):
 * the default layout form, in the setup wizard and the loop's Layout tab.
 */
export function SimpleLayoutForm({ layout, fields: unitFields, onChange }: { layout: SimpleLayout; fields: string[]; onChange: (layout: SimpleLayout) => void }) {
  const id = useId();
  // The units' fields, and any the layout uses that the units don't have (yet).
  const fields = [...new Set([...unitFields, ...[layout.title, layout.byline, ...layout.body].filter((f): f is string => !!f)])];
  const fieldSelect = (role: "title" | "byline", label: string) => (
    <div className="flex items-center gap-2">
      <label htmlFor={`${id}-${role}`} className="w-16 text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={`${id}-${role}`}
        className={selectClass}
        value={layout[role] ?? ""}
        onChange={(e) => {
          const next = { ...layout, [role]: e.target.value || undefined, body: layout.body.filter((f) => f !== e.target.value) };
          if (!next[role]) delete next[role];
          onChange(next);
        }}
      >
        <option value="">(none)</option>
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  );
  // Fields not used as title or byline can be body, in the units' field order.
  const bodyFields = fields.filter((f) => f !== layout.title && f !== layout.byline);
  return (
    <div className="flex flex-col gap-2">
      {fieldSelect("title", "Title")}
      {fieldSelect("byline", "Byline")}
      <fieldset className="flex items-start gap-2">
        <legend className="sr-only">Body</legend>
        <span className="w-16 pt-0.5 text-xs font-medium text-muted-foreground" aria-hidden>
          Body
        </span>
        <span className="flex flex-col gap-1">
          {bodyFields.length === 0 && <span className="text-xs text-muted-foreground">No other fields</span>}
          {bodyFields.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={layout.body.includes(f)}
                onChange={(e) => onChange({ ...layout, body: bodyFields.filter((x) => (x === f ? e.target.checked : layout.body.includes(x))) })}
              />
              <span className="font-mono text-xs">{f}</span>
            </label>
          ))}
        </span>
      </fieldset>
    </div>
  );
}
