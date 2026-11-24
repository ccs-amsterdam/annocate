import { MAX_TEXT_LENGTH, SCALE_LAYOUTS, type AnyVariableType } from "@annotinder/contracts";
import { InfoTip } from "@/components/ui/info-tip";
import { withOptional, withOptionals } from "../../../design/itemSettings";
import { OptionsEditor } from "../OptionsEditor";
import { ScaleItemsEditor } from "../ScaleItemsEditor";
import { LayoutSelect } from "./LayoutSelect";
import { RelationRules, type SpanQuestion } from "./RelationRules";
import { SpanFieldsPicker } from "./SpanFields";
import { SpecialAnswersFields } from "./SpecialAnswersFields";

// What the answer types without a file of their own need besides the
// question text: scale, swipe, text, span and relation.

type Variable<T extends AnyVariableType["type"]> = Extract<AnyVariableType, { type: T }>;
type OnChange = (next: AnyVariableType) => void;

/** A scale's items, its answer options (the same for every item), special answers and layout. */
export function ScaleFields({ variable: v, onChange }: { variable: Variable<"scale">; onChange: OnChange }) {
  return (
    <>
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
        onChange={(layout) => onChange({ ...v, layout: layout === "auto" ? undefined : (layout as typeof v.layout) })}
      />
    </>
  );
}

/** A swipe question's options (three at most), and whether the unit is on a card. */
export function SwipeFields({ variable: v, onChange }: { variable: Variable<"swipe">; onChange: OnChange }) {
  return (
    <>
      <OptionsEditor swipe max={3} options={v.options} onChange={(options) => onChange({ ...v, options })} />
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={v.card ?? false}
            onChange={(e) => onChange(withOptional(v, "card", e.target.checked || undefined))}
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

/** An open answer: one line or several, and how long it can be. */
export function TextFields({ variable: v, onChange }: { variable: Variable<"text">; onChange: OnChange }) {
  const set = (patch: Pick<Partial<typeof v>, "multiline" | "maxLength">) => {
    const next = { ...v, ...patch };
    onChange(withOptionals(next, { multiline: next.multiline || undefined, maxLength: next.maxLength }));
  };
  return (
    <>
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

/** A span question: where coders select, how, and the labels to give a selection. */
export function SpanQuestionFields({
  variable: v,
  layoutFields,
  onChange,
}: {
  variable: Variable<"span">;
  /** In a loop: what span questions can select in. */
  layoutFields?: string[];
  onChange: OnChange;
}) {
  return (
    <>
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

/** A relation question: its relation types, and which spans each can relate. */
export function RelationFields({
  variable: v,
  spanQuestions,
  onChange,
}: {
  variable: Variable<"relation">;
  /** The span questions before it in its loop, with their labels. */
  spanQuestions: SpanQuestion[];
  onChange: OnChange;
}) {
  return (
    <>
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
