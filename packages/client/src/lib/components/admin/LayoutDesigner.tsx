import { useEffect, useState, type ReactNode } from "react";
import { buildScope } from "@annotinder/contracts";
import { Plus, X } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SimpleLayout } from "../../codebook/simpleLayout";
import { simpleTemplate } from "../../codebook/simpleLayout";
import { renderTemplate, type RenderedTemplate } from "../../codebook/renderTemplate";
import { UnitFields } from "../UnitFields";

// A unit's layout as a sketch of a document (codebook/simpleLayout.ts):
// click a place (title, byline, body) to put a field there. Title and
// byline hold one field; the body any number, in order. The default layout
// form, in the setup wizard and the loop's Layout tab. More places (an
// image, a footer, columns) can join the sketch later.

/** One place in the sketch: empty (dashed, "click to choose"), or the field it shows. */
function Slot({
  label,
  field,
  fields,
  className,
  onChoose,
  onRemove,
  children,
}: {
  label: string;
  field: string | undefined;
  fields: string[];
  className?: string;
  onChoose: (field: string) => void;
  onRemove?: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={field ? `${label}: ${field}` : `${label}: choose a field`}
            className={cn(
              "w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors",
              field ? "hover:bg-primary/5 hover:ring-1 hover:ring-primary/40" : "border border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              className,
            )}
          >
            {field ? (
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1">{children ?? <span className="font-mono">{field}</span>}</span>
                <span className="shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 group-hover:invisible">{label}</span>
              </span>
            ) : (
              <span className="text-xs">{label}: click to choose a field</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1" role="menu">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {fields.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No (other) fields</p>}
          {fields.map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChoose(f);
              }}
              className={cn("block w-full rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted", f === field && "bg-primary/10 text-primary")}
            >
              {f}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {field && onRemove && (
        <button
          type="button"
          aria-label={`Remove ${field} from the ${label.toLowerCase()}`}
          onClick={onRemove}
          className="absolute right-1 top-1 hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block group-focus-within:block"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Grey lines that stand for a field's text. */
const Lines = ({ n }: { n: number }) => (
  <span className="mt-1 flex flex-col gap-1" aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className={cn("h-1.5 rounded bg-muted-foreground/15", i === n - 1 ? "w-2/3" : "w-full")} />
    ))}
  </span>
);

export function LayoutDesigner({ layout, fields: unitFields, onChange }: { layout: SimpleLayout; fields: string[]; onChange: (layout: SimpleLayout) => void }) {
  // The units' fields, and any the layout uses that the units don't have (yet).
  const fields = [...new Set([...unitFields, ...[layout.title, layout.byline, ...layout.body].filter((f): f is string => !!f)])];
  const used = new Set([layout.title, layout.byline, ...layout.body].filter(Boolean));
  const free = (keep?: string) => fields.filter((f) => f === keep || !used.has(f));
  const set = (role: "title" | "byline", field: string | undefined) => {
    const next: SimpleLayout = { ...layout, body: layout.body.filter((f) => f !== field) };
    if (field) next[role] = field;
    else delete next[role];
    onChange(next);
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-sm" aria-label="Layout of a unit">
      <div className="flex flex-col gap-1.5">
        <Slot label="Title" field={layout.title} fields={free(layout.title)} onChoose={(f) => set("title", f)} onRemove={() => set("title", undefined)}>
          <span className="block text-lg font-bold leading-tight text-foreground">
            <span className="font-mono">{layout.title}</span>
          </span>
        </Slot>
        <Slot
          label="Byline"
          field={layout.byline}
          fields={free(layout.byline)}
          className="py-1"
          onChoose={(f) => set("byline", f)}
          onRemove={() => set("byline", undefined)}
        >
          <span className="block text-xs italic text-muted-foreground">
            <span className="font-mono">{layout.byline}</span>
          </span>
        </Slot>
        <div className="mt-1 flex flex-col gap-1.5" role="group" aria-label="Body">
          {layout.body.map((field, i) => (
            <Slot
              key={`${field}-${i}`}
              label="Body"
              field={field}
              fields={free(field)}
              onChoose={(f) => onChange({ ...layout, body: layout.body.map((x, j) => (j === i ? f : x)) })}
              onRemove={() => onChange({ ...layout, body: layout.body.filter((_, j) => j !== i) })}
            >
              <span className="block text-sm text-foreground">
                <span className="font-mono">{field}</span>
                <Lines n={3} />
              </span>
            </Slot>
          ))}
          <AddToBody fields={free()} empty={layout.body.length === 0} onAdd={(f) => onChange({ ...layout, body: [...layout.body, f] })} />
        </div>
      </div>
    </div>
  );
}

/** The body's last place: adds a field after the others. */
function AddToBody({ fields, empty, onAdd }: { fields: string[]; empty: boolean; onAdd: (field: string) => void }) {
  const [open, setOpen] = useState(false);
  if (fields.length === 0 && !empty) return <p className="px-2 text-center text-[11px] text-muted-foreground">Every field is placed.</p>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-3 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {empty ? "Body: click to add a field" : "Add a field to the body"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1" role="menu">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Body</p>
        {fields.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No (other) fields</p>}
        {fields.map((f) => (
          <button
            key={f}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAdd(f);
            }}
            className="block w-full rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted"
          >
            {f}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A unit as coders would see it with a layout (the setup wizard's preview). */
export function UnitPreview({ layout, unit }: { layout: SimpleLayout; unit: Record<string, unknown> }) {
  const template = simpleTemplate(layout);
  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);
  useEffect(() => {
    let current = true;
    renderTemplate(template, buildScope(new Map(), {}, unit), undefined, "preview")
      .then((r) => current && setRendered(r))
      .catch(() => current && setRendered(null));
    return () => {
      current = false;
    };
  }, [template, unit]);
  if (!template) return <p className="text-xs text-muted-foreground">Choose fields to see a unit here.</p>;
  return rendered ? <UnitFields layout={{ template }} rendered={rendered} /> : null;
}
