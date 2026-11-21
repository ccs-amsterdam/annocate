import { InfoTip } from "@/components/ui/info-tip";
import {
  NOMINAL_LAYOUTS,
  NUMERIC_LAYOUTS,
  ORDINAL_LAYOUTS,
  SCALE_LAYOUTS,
  layoutWarning,
  resolveLayout,
  type AnyVariableType,
  type CategoricalType,
  type NumericType,
} from "@annotinder/contracts";
import { OptionsEditor } from "./OptionsEditor";
import { ScaleItemsEditor } from "./ScaleItemsEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HelpButton } from "../../help/HelpButton";

/** Just the shared `question`/`instruction` fields -- kept as a plain (non-union-derived) shape so
 * patches don't get incorrectly widened back into a cross-product union of every variable type
 * (a `Partial<Extract<Union, ...>>` distributes member-wise and reintroduces every variant's fields). */
interface QuestionFieldsValue {
  question: string;
  instruction?: string;
  instructionWhen?: "always" | "first" | "practice";
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
          placeholder="The question coders see (markdown; values like $var.name.label work)"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Instruction (optional)</label>
        <Textarea
          value={value.instruction ?? ""}
          onChange={(e) => onChange({ instruction: e.target.value || undefined })}
        />
        {value.instruction && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show it
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={value.instructionWhen ?? "always"}
              onChange={(e) =>
                onChange({
                  instructionWhen: e.target.value === "always" ? undefined : (e.target.value as "first" | "practice"),
                })
              }
            >
              <option value="always">Always</option>
              <option value="first">The first time a coder sees the question</option>
              <option value="practice">Only on practice units</option>
            </select>
          </label>
        )}
      </div>
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
  stratifyChoices = [],
  setColumns = [],
}: {
  variable: AnyVariableType;
  onChange: (next: AnyVariableType) => void;
  /** The loop's question names, for `relation`'s from/to question pickers. */
  unitVariableNames?: string[];
  /** In a loop: what span questions can select in (`unit.<field>` shown as plain text, ::: text blocks). */
  layoutFields?: string[];
  /** For `auto`: what a balanced draw can balance within (earlier questions, `session.<name>`). */
  stratifyChoices?: string[];
  /** For a random condition: the units' set columns it can be linked to. */
  setColumns?: string[];
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
          <OptionsEditor
            key="ordinal"
            level="ordinal"
            specials
            options={v.options}
            onChange={(options) => onChange({ ...v, options })}
          />
          <LayoutSelect
            variable={v}
            layouts={SCALE_LAYOUTS}
            onChange={(layout) =>
              onChange({ ...v, layout: layout === "auto" ? undefined : (layout as typeof v.layout) })
            }
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
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={v.card ?? false}
                onChange={(e) => {
                  const next = { ...v };
                  if (e.target.checked) next.card = true;
                  else delete next.card;
                  onChange(next);
                }}
              />
              Show the unit on a card while this question is asked
            </label>
            <InfoTip label="About the card">
              In a unit loop. Without a card the unit is shown as it is, so the layout doesn&apos;t change between
              questions.
            </InfoTip>
          </div>
        </>
      );
    }
    case "confirm": {
      const v = variable;
      return <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />;
    }
    case "random": {
      const v = variable;
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1 text-sm font-medium">
              Drawn
              <InfoTip label="About random conditions">
                Assigned when a coder reaches this item, so earlier questions can come first (coders screened out before
                don&apos;t count). Use it as <span className="font-mono">$var.name</span>. Linked to a set column of the
                units, it also selects the coder&apos;s units.
              </InfoTip>
            </label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={v.draw}
              onChange={(e) => onChange({ ...v, draw: e.target.value as typeof v.draw })}
            >
              <option value="balanced">Balanced (the value fewest coders have)</option>
              <option value="random">Random</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1 text-sm font-medium">
              Linked to units
              <InfoTip label="About linking to units">
                Linked to a set column, the coder&apos;s value also selects their units in the loops after this item:
                only units whose cell holds it (and <span className="font-mono">_overlap</span> units).
              </InfoTip>
            </label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={v.units ?? ""}
              onChange={(e) => {
                const next: typeof v = { ...v, units: e.target.value || undefined };
                if (!next.units) {
                  delete next.units;
                  if (!next.options) next.options = [{ value: "control" }, { value: "experiment" }];
                }
                onChange(next);
              }}
            >
              <option value="">Not linked to units</option>
              {[...new Set([...setColumns, ...(v.units ? [v.units] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                  {setColumns.includes(c) ? "" : " (not in the units)"}
                </option>
              ))}
            </select>
            {v.units && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!v.options}
                  onChange={(e) => {
                    const next: typeof v = { ...v };
                    if (e.target.checked) delete next.options;
                    else next.options = [{ value: "control" }, { value: "experiment" }];
                    onChange(next);
                  }}
                />
                All values in the column (no fixed list)
              </label>
            )}
          </div>
          {v.draw === "balanced" && stratifyChoices.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Balance within groups of (optional)</label>
              <div className="flex flex-wrap gap-1">
                {[...new Set([...stratifyChoices, ...(v.stratify ?? [])])].map((name) => {
                  const on = v.stratify?.includes(name) ?? false;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        const stratify = on
                          ? (v.stratify ?? []).filter((n) => n !== name)
                          : [...(v.stratify ?? []), name];
                        const next: typeof v = { ...v, stratify };
                        if (stratify.length === 0) delete next.stratify;
                        onChange(next);
                      }}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Stratified: e.g. with gender, the options are balanced among women, and among men.
              </p>
            </div>
          )}
          {v.options && (
            <OptionsEditor
              options={v.options}
              onChange={(options) => onChange({ ...v, options })}
              extra={
                v.draw === "random"
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
          <SpanFieldsPicker
            value={v.fields}
            layoutFields={layoutFields}
            onChange={(fields) => onChange({ ...v, fields })}
          />
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
              <label className="text-sm font-medium">From (span question)</label>
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
              <label className="text-sm font-medium">To (span question)</label>
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
        </>
      );
    }
    case "unspecified": {
      const v = variable;
      return (
        <>
          <p className="rounded-md border border-amber-500/60 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
            This question has a name but no answer type yet. Choose one above: the form then shows what that type needs
            (options, labels, a range). The design can be saved like this, but not previewed or deployed.
          </p>
          <QuestionFields
            value={{ ...v, question: v.question ?? "" }}
            onChange={(patch) => onChange({ ...v, ...patch })}
          />
        </>
      );
    }
    default:
      return null;
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
  return "columns" in resolved && resolved.layout === "grid"
    ? `${label.split(" (")[0]}, ${resolved.columns} column${resolved.columns === 1 ? "" : "s"}`
    : label;
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
function CategoricalFields({
  variable: v,
  onChange,
}: {
  variable: CategoricalType;
  onChange: (next: AnyVariableType) => void;
}) {
  const ordinal = v.type === "ordinal";
  const setLayout = (layout: string) => {
    const next = { ...v, layout: layout === "auto" ? undefined : layout } as CategoricalType;
    if (layout !== "grid") delete next.columns;
    onChange(next);
  };
  return (
    <>
      {v.type === "ordinal" ? (
        <OptionsEditor
          key="ordinal"
          level="ordinal"
          specials
          options={v.options}
          onChange={(options) => onChange({ ...v, options })}
        />
      ) : (
        <OptionsEditor key="nominal" specials options={v.options} onChange={(options) => onChange({ ...v, options })} />
      )}
      {v.type === "nominal" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!v.multiple}
            onChange={(e) => onChange({ ...v, multiple: e.target.checked || undefined })}
          />
          Allow several answers
        </label>
      )}
      <LayoutSelect variable={v} layouts={ordinal ? ORDINAL_LAYOUTS : NOMINAL_LAYOUTS} onChange={setLayout} />
      {v.layout === "grid" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Columns</label>
          <select
            className={selectClass}
            value={v.columns ?? 1}
            onChange={(e) => onChange({ ...v, columns: Number(e.target.value) })}
          >
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

const STEP_PRESETS = [
  { step: 1, label: "Whole numbers" },
  { step: 0.1, label: "One decimal" },
  { step: 0.01, label: "Two decimals" },
];

function NumericFields({
  variable: v,
  onChange,
}: {
  variable: NumericType;
  onChange: (next: AnyVariableType) => void;
}) {
  const step = v.step ?? 1;
  const preset = STEP_PRESETS.some((p) => p.step === step);
  const numberOrUndefined = (text: string) => (text === "" ? undefined : Number(text));
  const labels = v.labels ?? [];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Minimum</label>
          <Input
            type="number"
            value={v.min ?? ""}
            onChange={(e) => onChange({ ...v, min: numberOrUndefined(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Maximum</label>
          <Input
            type="number"
            value={v.max ?? ""}
            onChange={(e) => onChange({ ...v, max: numberOrUndefined(e.target.value) })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Steps</label>
        <div className="flex gap-2">
          <select
            className={`${selectClass} flex-1`}
            value={preset ? String(step) : "custom"}
            onChange={(e) =>
              onChange({
                ...v,
                step:
                  e.target.value === "custom" ? 5 : Number(e.target.value) === 1 ? undefined : Number(e.target.value),
              })
            }
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
              onChange={(e) =>
                onChange({ ...v, step: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })
              }
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
              onChange={(e) =>
                onChange({
                  ...v,
                  labels: labels.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)),
                })
              }
            />
            <Input
              className="flex-1"
              value={l.label}
              onChange={(e) =>
                onChange({ ...v, labels: labels.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
              }
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
        onChange={(layout) =>
          onChange({ ...v, layout: layout === "auto" ? undefined : (layout as NumericType["layout"]) })
        }
      />
    </>
  );
}

/**
 * What a span question selects in: the names the loop's layout shows as
 * selectable text, to switch on and off (each span records its name).
 * Without the layout's names (outside a loop): names separated by commas.
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
  const toggle = (field: string) =>
    onChange(value.includes(field) ? value.filter((f) => f !== field) : [...value, field]);
  // The layout's selectable ids are `unit.<field>`; a span question names the unit field.
  const shownFields = layoutFields?.map((id) => id.replace(/^unit\./, ""));
  const names = [...new Set([...(shownFields ?? []), ...value])];
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <label className="text-sm font-medium">Select in</label>
        <HelpButton topic="span" label="Help: selecting text" />
      </span>
      {shownFields ? (
        names.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            The layout has nothing to select in yet: show a unit field as plain text, $unit.&lt;field&gt;.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {names.map((name) => {
              const shown = shownFields.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  title={shown ? undefined : "The layout doesn't show this as plain text"}
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
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((f) => f.trim())
                .filter(Boolean),
            )
          }
          placeholder="headline, text"
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Spans record where they are, so one question can annotate e.g. the headline and the text.
      </p>
    </div>
  );
}
