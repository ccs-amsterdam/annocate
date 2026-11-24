import { MAX_TEXT_LENGTH } from "@annotinder/contracts";
import { InfoTip } from "@/components/ui/info-tip";
import { SCALE_LAYOUTS, type AnyVariableType } from "@annotinder/contracts";
import { OptionsEditor } from "./OptionsEditor";
import { SpecialAnswersFields } from "./variableType/SpecialAnswersFields";
import { ScaleItemsEditor } from "./ScaleItemsEditor";
import { QuestionField } from "./variableType/QuestionField";
import { LayoutSelect } from "./variableType/LayoutSelect";
import { CategoricalFields } from "./variableType/CategoricalFields";
import { NumericFields } from "./variableType/NumericFields";
import { RandomConditionFields, type ExperimentContext } from "./variableType/RandomConditionFields";
import { SpanFieldsPicker } from "./variableType/SpanFields";
import { RelationRules, type SpanQuestion } from "./variableType/RelationRules";

/**
 * The form for a question's answer type (docs/client.md §4 "Types"): the
 * question text and what its type needs (options, a range, ...); the parts
 * are in `variableType/`. A variable's `questionStyle` is edited as JSON
 * only.
 */
export function VariableTypeForm({
  variable,
  onChange,
  spanQuestions = [],
  layoutFields,
  stratifyChoices = [],
  experiment,
}: {
  variable: AnyVariableType;
  onChange: (next: AnyVariableType) => void;
  /** For a relation question: the span questions before it in its loop, with their labels. */
  spanQuestions?: SpanQuestion[];
  /** In a loop: what span questions can select in (`unit.<field>` shown as plain text, ::: text blocks). */
  layoutFields?: string[];
  /** For a random condition: what a balanced draw can balance within (earlier questions, `session.<name>`). */
  stratifyChoices?: string[];
  /** For an experiment: the units' role columns, the URL parameters, the API (to make a condition set). */
  experiment?: ExperimentContext;
}) {
  switch (variable.type) {
    case "nominal":
    case "ordinal": {
      const v = variable;
      return (
        <>
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <CategoricalFields variable={v} onChange={onChange} />
        </>
      );
    }
    case "numeric": {
      const v = variable;
      return (
        <>
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <NumericFields variable={v} onChange={onChange} />
        </>
      );
    }
    case "scale": {
      const v = variable;
      return (
        <>
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <ScaleItemsEditor items={v.items} onChange={(items) => onChange({ ...v, items })} />
          <OptionsEditor
            key="ordinal"
            level="ordinal"
            options={v.options}
            onChange={(options) => onChange({ ...v, options })}
          />
          <SpecialAnswersFields specials={v.specials} onChange={(specials) => onChange({ ...v, specials })} />
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
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
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
      return <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />;
    }
    case "text": {
      const v = variable;
      const set = (patch: Partial<typeof v>) => {
        const next = { ...v, ...patch };
        if (!next.multiline) delete next.multiline;
        if (next.maxLength === undefined) delete next.maxLength;
        onChange(next);
      };
      return (
        <>
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.multiline ?? false}
              onChange={(e) => set({ multiline: e.target.checked || undefined })}
            />
            Several lines (a text area; Ctrl + Enter continues)
          </label>
          <label className="flex items-center gap-2 text-sm">
            At most
            <input
              type="number"
              min={1}
              max={MAX_TEXT_LENGTH}
              placeholder={String(MAX_TEXT_LENGTH)}
              aria-label="Most characters"
              value={v.maxLength ?? ""}
              onChange={(e) => set({ maxLength: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}
              className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
            />
            characters
          </label>
        </>
      );
    }
    case "random":
      return (
        <RandomConditionFields
          variable={variable}
          stratifyChoices={stratifyChoices}
          experiment={experiment}
          onChange={onChange}
        />
      );
    case "span": {
      const v = variable;
      return (
        <>
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
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
          <QuestionField value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <OptionsEditor options={v.options} onChange={(options) => onChange({ ...v, options })} />
          <RelationRules
            rules={v.rules}
            types={v.options}
            spanQuestions={spanQuestions}
            onChange={(rules) => onChange({ ...v, rules })}
          />
        </>
      );
    }
    case "unspecified":
      // Not asked yet: the form shows only the answer types (ItemForm)
      return null;
    default:
      return null;
  }
}
