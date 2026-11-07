import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { buildScope, type UnitFieldType } from "@annotinder/contracts";
import { ChevronDown, ChevronUp, Hash, Plus, ToggleLeft, Type, X } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { placeField, placedFields, removeField, simpleTemplate, type LayoutSlot, type SimpleLayout } from "../../design/simpleLayout";
import { renderTemplate, type RenderedTemplate } from "../../codebook/renderTemplate";
import { UnitFields } from "../UnitFields";

// A unit's layout as a sketch of a document (design/simpleLayout.ts): an
// empty title, byline and body, and the unit fields not shown yet. Click a
// place to choose a field for it, or drag a field onto it; clicking a field
// adds it to the body. Title and byline hold one field; the body any
// number, in order. The default layout form, in the setup wizard and the
// loop's Layout tab. More places (an image, a footer, columns) can join the
// sketch later.

/** Drag data: a field's name. */
const DRAG_TYPE = "application/x-annotinder-field";

const TYPE_ICON: Record<UnitFieldType, typeof Type> = { text: Type, number: Hash, boolean: ToggleLeft };

/** Drop handlers for a place: highlights while a field is over it. */
function useDrop(onDrop: (field: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        const field = e.dataTransfer.getData(DRAG_TYPE);
        setOver(false);
        if (!field) return;
        e.preventDefault();
        onDrop(field);
      },
    },
  };
}

/** Starts dragging a field. */
const dragField = (field: string) => (e: DragEvent) => {
  e.dataTransfer.setData(DRAG_TYPE, field);
  e.dataTransfer.effectAllowed = "move";
};

/** A list of fields to choose from, in a popover. */
function FieldMenu({ label, fields, current, onChoose }: { label: string; fields: string[]; current?: string; onChoose: (field: string) => void }) {
  return (
    <PopoverContent align="start" className="w-56 p-1" role="menu" aria-label={label}>
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {fields.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Every field is placed</p>}
      {fields.map((f) => (
        <button
          key={f}
          type="button"
          role="menuitem"
          onClick={() => onChoose(f)}
          className={cn("block w-full rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted", f === current && "bg-primary/10 text-primary")}
        >
          {f}
        </button>
      ))}
    </PopoverContent>
  );
}

/**
 * One place for a field: empty (its placeholder, faint), or the field it
 * shows. Click to choose a field (an unplaced one), or drop one on it.
 */
function Slot({
  label,
  field,
  choices,
  placeholder,
  onPlace,
  onDrop = onPlace,
  onRemove,
  dragSource,
  extra,
  children,
}: {
  label: string;
  field?: string;
  choices: string[];
  placeholder: ReactNode;
  /** A field chosen for this place (from its menu). */
  onPlace: (field: string) => void;
  /** A field dropped on it (default: as chosen). */
  onDrop?: (field: string) => void;
  onRemove?: () => void;
  /** A placed field can be dragged elsewhere. */
  dragSource?: boolean;
  /** More buttons beside remove (e.g. move up and down). */
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const drop = useDrop(onDrop);
  return (
    <div className="group relative" {...drop.props}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={field ? `${label}: ${field}` : `${label}: choose a field`}
            draggable={!!(field && dragSource)}
            onDragStart={field ? dragField(field) : undefined}
            className={cn(
              "w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors",
              field ? "hover:bg-primary/5 hover:ring-1 hover:ring-primary/40" : "border border-dashed border-border/80 hover:border-primary/60",
              drop.over && "bg-primary/10 ring-2 ring-primary/60",
            )}
          >
            {field ? (
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1">{children}</span>
                <span className="shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 group-focus-within:invisible group-hover:invisible">
                  {label}
                </span>
              </span>
            ) : (
              placeholder
            )}
          </button>
        </PopoverTrigger>
        <FieldMenu
          label={label}
          fields={choices}
          current={field}
          onChoose={(f) => {
            setOpen(false);
            onPlace(f);
          }}
        />
      </Popover>
      {field && onRemove && (
        <span className="absolute right-1 top-1 hidden items-center gap-0.5 group-focus-within:flex group-hover:flex">
          {extra}
          <button
            type="button"
            aria-label={`Remove ${field} from the ${label.toLowerCase()}`}
            onClick={onRemove}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

/** Grey lines that stand for text. */
const Lines = ({ n, faint }: { n: number; faint?: boolean }) => (
  <span className="mt-1 flex flex-col gap-1" aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className={cn("h-1.5 rounded", faint ? "bg-muted-foreground/10" : "bg-muted-foreground/15", i === n - 1 ? "w-2/3" : "w-full")} />
    ))}
  </span>
);

/** A placeholder's name, faint, as in an empty document. */
const PlaceholderText = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn("block text-muted-foreground/60", className)}>{children}</span>
);

export function LayoutDesigner({
  layout,
  fields: unitFields,
  types = {},
  onChange,
}: {
  layout: SimpleLayout;
  /** The units' fields. */
  fields: string[];
  /** Their types, when known (an icon per field). */
  types?: Partial<Record<string, UnitFieldType>>;
  onChange: (layout: SimpleLayout) => void;
}) {
  // The units' fields, and any the layout shows that the units don't have (yet).
  const placed = placedFields(layout);
  const fields = [...new Set([...unitFields, ...placed])];
  const unplaced = fields.filter((f) => !placed.includes(f));
  const place = (field: string, slot: LayoutSlot, at?: number) => onChange(placeField(layout, field, slot, at));
  const remove = (field: string) => onChange(removeField(layout, field));
  const bodyDrop = useDrop((f) => place(f, "body"));

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-sm" aria-label="Layout of a unit">
        <div className="flex flex-col gap-1.5">
          <Slot
            label="Title"
            field={layout.title}
            choices={unplaced}
            dragSource
            onPlace={(f) => place(f, "title")}
            onRemove={layout.title ? () => remove(layout.title!) : undefined}
            placeholder={<PlaceholderText className="text-lg font-bold leading-tight">Title</PlaceholderText>}
          >
            <span className="block font-mono text-lg font-bold leading-tight text-foreground">{layout.title}</span>
          </Slot>
          <Slot
            label="Byline"
            field={layout.byline}
            choices={unplaced}
            dragSource
            onPlace={(f) => place(f, "byline")}
            onRemove={layout.byline ? () => remove(layout.byline!) : undefined}
            placeholder={<PlaceholderText className="text-xs italic">Byline</PlaceholderText>}
          >
            <span className="block font-mono text-xs italic text-muted-foreground">{layout.byline}</span>
          </Slot>
          <div className="mt-1 flex flex-col gap-1.5" role="group" aria-label="Body">
            {layout.body.map((field, i) => (
              <Slot
                key={field}
                label="Body"
                field={field}
                choices={unplaced}
                dragSource
                // Chosen: another field in its place; dropped: before it
                onPlace={(f) => onChange(placeField(removeField(layout, field), f, "body", i))}
                onDrop={(f) => f !== field && place(f, "body", i)}
                onRemove={() => remove(field)}
                extra={
                  <>
                    {i > 0 && (
                      <button
                        type="button"
                        aria-label={`Move ${field} up`}
                        onClick={() => place(field, "body", i - 1)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {i < layout.body.length - 1 && (
                      <button
                        type="button"
                        aria-label={`Move ${field} down`}
                        onClick={() => place(field, "body", i + 2)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                }
                placeholder={null}
              >
                <span className="block text-sm text-foreground">
                  <span className="font-mono">{field}</span>
                  <Lines n={3} />
                </span>
              </Slot>
            ))}
            <AddToBody
              fields={unplaced}
              empty={layout.body.length === 0}
              drop={bodyDrop}
              onAdd={(f) => place(f, "body")}
            />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md" role="group" aria-label="Unit fields not shown">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {unplaced.length > 0 ? "Unit fields: click to add to the body, or drag onto a place" : "Every unit field is shown"}
        </p>
        {unplaced.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((f) => {
              const type = types[f];
              const Icon = type ? TYPE_ICON[type] : null;
              return (
                <button
                  key={f}
                  type="button"
                  draggable
                  onDragStart={dragField(f)}
                  onClick={() => place(f, "body")}
                  aria-label={`Add ${f} to the body`}
                  title={type ? `${f} (${type})` : f}
                  className="flex cursor-grab items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs hover:border-primary/60 hover:bg-primary/5 active:cursor-grabbing"
                >
                  {Icon && <Icon className="h-3 w-3 text-muted-foreground" aria-hidden />}
                  {f}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The body's last place: empty, the body's placeholder; else adds a field after the others. */
function AddToBody({
  fields,
  empty,
  drop,
  onAdd,
}: {
  fields: string[];
  empty: boolean;
  drop: ReturnType<typeof useDrop>;
  onAdd: (field: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (fields.length === 0 && !empty) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={empty ? "Body: choose a field" : "Body: add a field"}
          {...drop.props}
          className={cn(
            "flex w-full cursor-pointer flex-col rounded-md border border-dashed border-border/80 px-2 py-2 text-left hover:border-primary/60",
            drop.over && "bg-primary/10 ring-2 ring-primary/60",
          )}
        >
          {empty ? (
            <>
              <PlaceholderText className="text-sm">Body</PlaceholderText>
              <Lines n={3} faint />
            </>
          ) : (
            <span className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5" /> Add to the body
            </span>
          )}
        </button>
      </PopoverTrigger>
      <FieldMenu
        label="Body"
        fields={fields}
        onChoose={(f) => {
          setOpen(false);
          onAdd(f);
        }}
      />
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
