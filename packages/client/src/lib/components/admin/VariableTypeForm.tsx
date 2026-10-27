import {
  NOMINAL_LAYOUTS,
  NUMERIC_LAYOUTS,
  ORDINAL_LAYOUTS,
  SCALE_LAYOUTS,
  convertOptionsLevel,
  layoutWarning,
  resolveLayout,
  type AnyVariableType,
  type CategoricalType,
  type NominalType,
  type NumericType,
  type UnitVariableType,
  type UserVariableType,
} from "@annotinder/contracts";
import { OptionsEditor } from "./OptionsEditor";
import { ScaleItemsEditor } from "./ScaleItemsEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";


/** Just the shared `question`/`instruction` fields -- kept as a plain (non-union-derived) shape so
 * patches don't get incorrectly widened back into a cross-product union of every variable type
 * (a `Partial<Extract<Union, ...>>` distributes member-wise and reintroduces every variant's fields). */
interface QuestionFieldsValue {
  question: string;
  instruction?: string;
  instructionAuto?: boolean;
}

/** The shared `question`/`instruction` fields present on every non-`auto` variable type. */
function QuestionFields({
  value,
  onChange,
}: {
  value: QuestionFieldsValue;
  onChange: (patch: Partial<QuestionFieldsValue>) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Question</label>
        <Textarea
          value={value.question}
          onChange={(e) => onChange({ question: e.target.value })}
          placeholder="Markdown/QuickJS-templated question text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Instruction (optional)</label>
        <Textarea
          value={value.instruction ?? ""}
          onChange={(e) => onChange({ instruction: e.target.value || undefined })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!value.instructionAuto}
          onChange={(e) => onChange({ instructionAuto: e.target.checked || undefined })}
        />
        Show instruction automatically the first time
      </label>
    </>
  );
}

/**
 * Dispatches on `variable.type` to render the right sub-form
 * (docs/client.md §7). Covers every `UserVariableType`/`UnitVariableType` variant
 * (variableTypes.ts). Less-common nested fields (`questionStyle`,
 * `instructionStyle`) are intentionally not exposed here yet.
 */
export function VariableTypeForm({
  variable,
  onChange,
  unitVariableNames,
  layoutFields,
}: {
  variable: AnyVariableType;
  onChange: (next: AnyVariableType) => void;
  /** Sibling `unit_variable` names in the same codebook, for `relation`'s from/to variable pickers. */
  unitVariableNames?: string[];
  /** In a loop: the unit fields its layout shows (what a span question can select in). */
  layoutFields?: string[];
}) {
  switch (variable.type) {
    case "nominal":
    case "ordinal": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <CategoricalFields variable={v} onChange={onChange} />
        </>
      );
    }
    case "numeric": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <NumericFields variable={v} onChange={onChange} />
        </>
      );
    }
    case "scale": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <ScaleItemsEditor items={v.items} onChange={(items) => onChange({ ...v, items })} />
          <OptionsEditor key="ordinal" level="ordinal" options={v.options} onChange={(options) => onChange({ ...v, options })} />
          <LayoutSelect
            variable={v}
            layouts={SCALE_LAYOUTS}
            onChange={(layout) => onChange({ ...v, layout: layout === "auto" ? undefined : (layout as typeof v.layout) })}
          />
        </>
      );
    }
    case "annotinder": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <OptionsEditor swipe max={3} options={v.options} onChange={(options) => onChange({ ...v, options })} />
        </>
      );
    }
    case "confirm": {
      const v = variable;
      return <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />;
    }
    case "auto": {
      const v = variable;
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Source</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={v.source}
              onChange={(e) => onChange({ ...v, source: e.target.value as typeof v.source })}
            >
              <option value="random">Random draw</option>
              <option value="balanced">Balanced (option with fewest coders)</option>
              <option value="invite">Set by invitation</option>
              <option value="url_param">URL parameter</option>
            </select>
          </div>
          {v.source === "invite" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">If the invitation doesn&apos;t set it</label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={v.fallback ?? ""}
                onChange={(e) =>
                  onChange({ ...v, fallback: e.target.value === "" ? undefined : (e.target.value as "random" | "balanced") })
                }
              >
                <option value="">Leave empty</option>
                <option value="random">Random draw</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
          )}
          {v.source === "url_param" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">URL parameter name</label>
              <Input value={v.urlParam ?? ""} onChange={(e) => onChange({ ...v, urlParam: e.target.value })} />
            </div>
          )}
          {v.source !== "url_param" && (
            <OptionsEditor
              options={v.options ?? []}
              onChange={(options) => onChange({ ...v, options })}
              extra={
                v.source === "random"
                  ? (option, update) => (
                      <Input
                        placeholder="weight"
                        type="number"
                        title="Weight of this option in the random draw (default 1)"
                        value={option.weight ?? ""}
                        onChange={(e) => update({ weight: e.target.value === "" ? undefined : Number(e.target.value) })}
                        className="h-8 w-16 text-xs"
                      />
                    )
                  : undefined
              }
            />
          )}
        </>
      );
    }
    case "span": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <SpanFieldsPicker value={v.fields} layoutFields={layoutFields} onChange={(fields) => onChange({ ...v, fields })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Default Selection Mode</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={v.selectionMode ?? "word"}
              onChange={(e) => onChange({ ...v, selectionMode: e.target.value as "word" | "character" })}
            >
              <option value="word">Word level (snap selections to whole words)</option>
              <option value="character">Character level (select exact characters)</option>
            </select>
          </div>
          <OptionsEditor options={v.options} onChange={(options) => onChange({ ...v, options })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!v.gaps}
              onChange={(e) => onChange({ ...v, gaps: e.target.checked || undefined })}
            />
            Allow gaps (discontinuous spans with multiple fragments)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!v.editMode}
              onChange={(e) => onChange({ ...v, editMode: e.target.checked || undefined })}
            />
            Edit mode (allow re-editing existing spans)
          </label>
        </>
      );
    }
    case "relation": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <OptionsEditor options={v.options} onChange={(options) => onChange({ ...v, options })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">From (span variable)</label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={v.from.variable}
                onChange={(e) => onChange({ ...v, from: { ...v.from, variable: e.target.value } })}
              >
                <option value="">-- select --</option>
                {(unitVariableNames ?? []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">To (span variable)</label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={v.to.variable}
                onChange={(e) => onChange({ ...v, to: { ...v.to, variable: e.target.value } })}
              >
                <option value="">-- select --</option>
                {(unitVariableNames ?? []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!v.editMode}
              onChange={(e) => onChange({ ...v, editMode: e.target.checked || undefined })}
            />
            Edit mode
          </label>
        </>
      );
    }
    default:
      return null;
  }
}

export const VARIABLE_TYPE_OPTIONS_USER: UserVariableType["type"][] = ["nominal", "ordinal", "numeric", "scale", "annotinder", "confirm", "auto"];
export const VARIABLE_TYPE_OPTIONS_UNIT: UnitVariableType["type"][] = [
  "nominal",
  "ordinal",
  "numeric",
  "scale",
  "annotinder",
  "confirm",
  "span",
  "relation",
];

/** How answer types are named in the editor. */
export const VARIABLE_TYPE_LABELS: Record<AnyVariableType["type"], string> = {
  nominal: "Nominal (categories)",
  ordinal: "Ordinal (ordered options)",
  numeric: "Numeric (interval/ratio)",
  scale: "Scale (items on the same options)",
  annotinder: "Swipe",
  confirm: "Confirm",
  auto: "Auto (assigned, not asked)",
  span: "Span (select text)",
  relation: "Relation (link spans)",
};

export function defaultVariableForAnyType(type: string): AnyVariableType {
  switch (type) {
    case "nominal":
      return { type: "nominal", question: "", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] };
    case "ordinal":
      return {
        type: "ordinal",
        question: "",
        options: [
          { value: 1, label: "Low" },
          { value: 2, label: "Medium" },
          { value: 3, label: "High" },
        ],
      };
    case "numeric":
      return { type: "numeric", question: "", min: 0, max: 10 };
    case "scale":
      return {
        type: "scale",
        question: "",
        items: [{ name: "item_1" }],
        options: [
          { value: 1, label: "Strongly disagree" },
          { value: 2, label: "Disagree" },
          { value: 3, label: "Neutral" },
          { value: 4, label: "Agree" },
          { value: 5, label: "Strongly agree" },
        ],
      };
    case "annotinder":
      return { type: "annotinder", question: "", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] };
    case "confirm":
      return { type: "confirm", question: "" };
    case "auto":
      return { type: "auto", source: "random", options: [{ value: "control" }, { value: "experiment" }] };
    case "span":
      return { type: "span", question: "", fields: [], options: [{ value: "label_1", label: "Label 1" }] };
    case "relation":
      return {
        type: "relation",
        question: "",
        options: [{ value: "relation_1", label: "Relation 1" }],
        from: { variable: "" },
        to: { variable: "" },
      };
    default:
      throw new Error(`Unknown variable type: ${type}`);
  }
}

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

const LAYOUT_LABELS: Record<string, string> = {
  flex: "Flex (buttons wrap)",
  row: "Row (one row)",
  grid: "Grid (columns)",
  compact: "Compact (values; the selected one shows its label)",
  dropdown: "Dropdown with filter",
  input: "Number input",
  slider: "Slider",
  buttons: "Buttons (one per value)",
};

function describeLayout(resolved: ReturnType<typeof resolveLayout>): string {
  const label = LAYOUT_LABELS[resolved.layout] ?? resolved.layout;
  return "columns" in resolved && resolved.layout === "grid" ? `${label.split(" (")[0]}, ${resolved.columns} column${resolved.columns === 1 ? "" : "s"}` : label;
}

/** A layout select whose `auto` entry says what auto picks for this question (resolveLayout). */
function LayoutSelect({
  variable,
  layouts,
  onChange,
}: {
  variable: AnyVariableType & { layout?: string };
  layouts: readonly string[];
  onChange: (layout: string) => void;
}) {
  const auto = resolveLayout({ ...variable, layout: undefined } as AnyVariableType);
  const warning = layoutWarning(variable);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Layout</label>
      <select className={selectClass} value={variable.layout ?? "auto"} onChange={(e) => onChange(e.target.value)}>
        {layouts.map((l) => (
          <option key={l} value={l}>
            {l === "auto" ? `Auto (${describeLayout(auto)})` : LAYOUT_LABELS[l]}
          </option>
        ))}
      </select>
      {warning && <p className="text-[11px] text-amber-600 dark:text-amber-400">{warning}</p>}
    </div>
  );
}

/** Options, several answers (nominal) and layout of a nominal or ordinal question. */
function CategoricalFields({ variable: v, onChange }: { variable: CategoricalType; onChange: (next: AnyVariableType) => void }) {
  const ordinal = v.type === "ordinal";
  const setLayout = (layout: string) => {
    const next = { ...v, layout: layout === "auto" ? undefined : layout } as CategoricalType;
    if (layout !== "grid") delete next.columns;
    onChange(next);
  };
  return (
    <>
      {v.type === "ordinal" ? (
        <OptionsEditor key="ordinal" level="ordinal" options={v.options} onChange={(options) => onChange({ ...v, options })} />
      ) : (
        <OptionsEditor key="nominal" options={v.options} onChange={(options) => onChange({ ...v, options })} />
      )}
      {v.type === "nominal" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.multiple} onChange={(e) => onChange({ ...v, multiple: e.target.checked || undefined })} />
          Allow several answers
        </label>
      )}
      <LayoutSelect variable={v} layouts={ordinal ? ORDINAL_LAYOUTS : NOMINAL_LAYOUTS} onChange={setLayout} />
      {v.layout === "grid" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Columns</label>
          <select className={selectClass} value={v.columns ?? 1} onChange={(e) => onChange({ ...v, columns: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

/**
 * A question's variable as another answer type. Nominal and ordinal convert
 * into each other, keeping the options (values: 1..n to ordinal, derived
 * from the labels to nominal); other types start from their defaults. The
 * question texts are kept.
 */
export function switchVariableType(current: AnyVariableType, type: AnyVariableType["type"]): AnyVariableType {
  if (current.type === type) return current;
  if ((current.type === "nominal" || current.type === "ordinal") && (type === "nominal" || type === "ordinal")) {
    const rest = { ...(current as NominalType) };
    delete rest.multiple;
    const layout = rest.layout && (type === "ordinal" ? ORDINAL_LAYOUTS : NOMINAL_LAYOUTS).some((l) => l === rest.layout) ? rest.layout : undefined;
    return { ...rest, type, layout, options: convertOptionsLevel(current.options, type) } as AnyVariableType;
  }
  const next = defaultVariableForAnyType(type);
  const { question, instruction } = current as { question?: string; instruction?: string };
  if ("question" in next) Object.assign(next, { question: question ?? "", ...(instruction ? { instruction } : {}) });
  return next;
}

const STEP_PRESETS = [
  { step: 1, label: "Whole numbers" },
  { step: 0.1, label: "One decimal" },
  { step: 0.01, label: "Two decimals" },
];

function NumericFields({ variable: v, onChange }: { variable: NumericType; onChange: (next: AnyVariableType) => void }) {
  const step = v.step ?? 1;
  const preset = STEP_PRESETS.some((p) => p.step === step);
  const numberOrUndefined = (text: string) => (text === "" ? undefined : Number(text));
  const labels = v.labels ?? [];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Minimum</label>
          <Input type="number" value={v.min ?? ""} onChange={(e) => onChange({ ...v, min: numberOrUndefined(e.target.value) })} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Maximum</label>
          <Input type="number" value={v.max ?? ""} onChange={(e) => onChange({ ...v, max: numberOrUndefined(e.target.value) })} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Steps</label>
        <div className="flex gap-2">
          <select
            className={`${selectClass} flex-1`}
            value={preset ? String(step) : "custom"}
            onChange={(e) => onChange({ ...v, step: e.target.value === "custom" ? 5 : Number(e.target.value) === 1 ? undefined : Number(e.target.value) })}
          >
            {STEP_PRESETS.map((p) => (
              <option key={p.step} value={String(p.step)}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          {!preset && (
            <Input
              type="number"
              className="w-24"
              value={step}
              onChange={(e) => onChange({ ...v, step: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })}
            />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Labels (optional)</label>
        {labels.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="number"
              className="w-24"
              value={l.value}
              onChange={(e) => onChange({ ...v, labels: labels.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })}
            />
            <Input
              className="flex-1"
              value={l.label}
              onChange={(e) => onChange({ ...v, labels: labels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove label"
              onClick={() => {
                const next = labels.filter((_, j) => j !== i);
                onChange({ ...v, labels: next.length ? next : undefined });
              }}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange({ ...v, labels: [...labels, { value: v.min ?? 0, label: "" }] })}
        >
          + Add label
        </Button>
      </div>
      <LayoutSelect
        variable={v}
        layouts={NUMERIC_LAYOUTS}
        onChange={(layout) => onChange({ ...v, layout: layout === "auto" ? undefined : (layout as NumericType["layout"]) })}
      />
    </>
  );
}

/**
 * The unit fields a span question selects in: the fields the loop's layout
 * shows, to switch on and off (each span records its field). Without the
 * layout's fields (outside a loop): names separated by commas.
 */
function SpanFieldsPicker({
  value,
  layoutFields,
  onChange,
}: {
  value: string[];
  layoutFields?: string[];
  onChange: (fields: string[]) => void;
}) {
  const toggle = (field: string) => onChange(value.includes(field) ? value.filter((f) => f !== field) : [...value, field]);
  const names = [...new Set([...(layoutFields ?? []), ...value])];
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Unit fields to select in</label>
      {layoutFields ? (
        names.length === 0 ? (
          <p className="text-xs text-muted-foreground">The layout shows no unit fields yet: add them as $unit.&lt;field&gt; in the loop&apos;s layout.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {names.map((name) => {
              const shown = layoutFields.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  title={shown ? undefined : "The layout doesn't show this field as $unit." + name}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                    !shown
                      ? "border-destructive text-destructive"
                      : value.includes(name)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <Input
          value={value.join(", ")}
          onChange={(e) => onChange(e.target.value.split(",").map((f) => f.trim()).filter(Boolean))}
          placeholder="text, headline"
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Spans record the field they are in, so one question can annotate e.g. the headline and the text.
      </p>
    </div>
  );
}
