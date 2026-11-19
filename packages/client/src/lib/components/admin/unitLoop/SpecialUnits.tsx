import { useState } from "react";
import { cn } from "cn";
import {
  DEFAULT_RATE,
  GOLD_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  goldColumn,
  practiceColumn,
  practiceMessageColumn,
  type GoldSettings,
  type PracticeSettings,
  type OverlapSettings,
  type SetGroupResponse,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpButton } from "../../../help/HelpButton";
import { AnswerKeyDialog, type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import { selectClass, labelClass, type AnswerKeyContext, numberOrUndefined } from "./helpers";

// The special units of a unit loop (overlap, practice, gold): where they are placed,
// how often, and the questions checked against the right answers.

/**
 * The overlap: the `_overlap` units, which every coder codes besides their
 * own units; where they come, and how many.
 */
export function OverlapEditor({
  overlap,
  group,
  canSpread,
  onChange,
}: {
  overlap: OverlapSettings | undefined;
  group: SetGroupResponse | undefined;
  /** Spreading needs the number of units a coder gets: not known in a shared queue without max units per coder. */
  canSpread: boolean;
  onChange: (overlap: OverlapSettings | undefined) => void;
}) {
  const units = group?.sets.find((s) => s.name === OVERLAP_SET)?.unitIds.length ?? 0;
  const on = overlap !== undefined && overlap.placement !== "disabled";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          <span className="flex items-center gap-1.5">
            Overlap: units every coder codes too
            <HelpButton topic="overlap" label="Help: overlap" />
          </span>
          <select
            className={cn(selectClass, "w-fit font-normal")}
            value={overlap?.placement ?? ""}
            onChange={(e) => {
              const placement = e.target.value as OverlapSettings["placement"] | "";
              onChange(placement === "" ? undefined : { ...overlap, placement });
            }}
          >
            <option value="">Among the coder&apos;s own units (default)</option>
            <option value="spread" disabled={!canSpread}>
              Spread through the coder&apos;s units (recommended){canSpread ? "" : " (needs max units per coder)"}
            </option>
            <option value="rate">
              At a rate: about one in every few units{canSpread ? "" : " (recommended for crowd coding)"}
            </option>
            <option value="first">First, before the coder&apos;s own units (inflates reliability)</option>
            <option value="last">Last, after them</option>
            <option value="disabled">Leave them out of this loop</option>
          </select>
        </label>
        {on && overlap.placement === "rate" && (
          <RateFields value={overlap} onChange={(rate) => onChange({ ...overlap, ...rate })} />
        )}
        {on && (
          <>
            <label className={labelClass}>
              Recommended
              <Input
                type="number"
                min={1}
                className="h-8 w-24 text-xs font-normal"
                placeholder="any"
                title="Warns at deploying if the group has fewer overlap units"
                value={overlap.expect ?? ""}
                onChange={(e) => onChange({ ...overlap, expect: numberOrUndefined(e.target.value) })}
              />
            </label>
            <label className={labelClass}>
              At most
              <Input
                type="number"
                min={1}
                className="h-8 w-24 text-xs font-normal"
                placeholder="all"
                value={overlap.max ?? ""}
                onChange={(e) => onChange({ ...overlap, max: numberOrUndefined(e.target.value) })}
              />
            </label>
            {overlap.max !== undefined && (
              <label className={labelClass}>
                Which
                <select
                  className={`${selectClass} font-normal`}
                  value={overlap.pick ?? "first"}
                  onChange={(e) => onChange({ ...overlap, pick: e.target.value as OverlapSettings["pick"] })}
                >
                  <option value="first">The first ones</option>
                  <option value="random">A random draw (the same for every coder)</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
      {on && group && units === 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          No units are marked {OVERLAP_SET} yet: mark them in a set column on the Units page.
        </p>
      )}
      {on && units > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {Math.min(units, overlap.max ?? units)} of the {units} {OVERLAP_SET} units of group {group!.name}
          {overlap.expect !== undefined && units < overlap.expect
            ? ` (fewer than the ${overlap.expect} recommended)`
            : ""}
          .
        </p>
      )}
    </div>
  );
}

type Placement = PracticeSettings["placement"];

/** Where a group's practice or gold units go: off, or a placement. */
function PlacementSelect({
  value,
  canSpread,
  firstLabel,
  onChange,
}: {
  value: Placement | undefined;
  canSpread: boolean;
  firstLabel: string;
  onChange: (placement: Placement | undefined) => void;
}) {
  return (
    <select
      className={`${selectClass} w-fit font-normal`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : (e.target.value as Placement))}
    >
      <option value="">None</option>
      <option value="first">{firstLabel}</option>
      <option value="spread" disabled={!canSpread}>
        Spread through the coder&apos;s units{canSpread ? "" : " (needs max units per coder)"}
      </option>
      <option value="rate">At a rate: about one in every few units</option>
      <option value="last">Last, after the coder&apos;s own units</option>
    </select>
  );
}

/**
 * At a rate (contracts RateSettings): about one special unit in `every`,
 * at random per coder; what is left when the coder's own units run out
 * comes at the end or is dropped.
 */
function RateFields({
  value,
  onChange,
}: {
  value: { every?: number; rest?: "end" | "drop" };
  onChange: (rate: { every?: number; rest?: "end" | "drop" }) => void;
}) {
  return (
    <>
      <label className={labelClass}>
        One in
        <Input
          type="number"
          min={2}
          className="h-8 w-20 text-xs font-normal"
          placeholder={String(DEFAULT_RATE)}
          value={value.every ?? ""}
          onChange={(e) => onChange({ every: numberOrUndefined(e.target.value) })}
        />
      </label>
      <label className={labelClass}>
        Left when a coder&apos;s own units run out
        <select
          className={`${selectClass} w-fit font-normal`}
          value={value.rest ?? "end"}
          onChange={(e) => onChange({ rest: e.target.value as "end" | "drop" })}
        >
          <option value="end">At the end: every coder codes them all</option>
          <option value="drop">Dropped: coders code the ones they happened to get</option>
        </select>
      </label>
    </>
  );
}

/** Checkboxes for the loop's checkable questions, with the answer column each needs. */
function CheckedQuestions({
  checkable,
  value,
  column,
  onChange,
}: {
  checkable: AnswerKeyQuestion[];
  value: string[];
  column: (question: string) => string;
  onChange: (questions: string[]) => void;
}) {
  if (checkable.length === 0)
    return (
      <p className="text-[11px] text-muted-foreground">
        The loop has no questions that can be checked (choices, numbers or confirm).
      </p>
    );
  return (
    <div className="flex flex-col gap-1">
      {checkable.map(({ name: q }) => (
        <label key={q} className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value.includes(q)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? checkable.map((c) => c.name).filter((c) => c === q || value.includes(c))
                  : value.filter((c) => c !== q),
              )
            }
          />
          <span className="font-medium">{q}</span>
          <span className="text-muted-foreground">
            answer in column <code>{column(q)}</code>
          </span>
        </label>
      ))}
    </div>
  );
}

/** A note on the group's units of a special set: none yet, or how many. */
function SpecialSetNote({ group, set, what }: { group: SetGroupResponse | undefined; set: string; what: string }) {
  if (!group) return null;
  const units = group.sets.find((s) => s.name === set)?.unitIds.length ?? 0;
  return units === 0 ? (
    <p className="text-[11px] text-amber-700 dark:text-amber-400">
      No units are marked {set} yet: mark them in a set column on the Units page.
    </p>
  ) : (
    <p className="text-[11px] text-muted-foreground">
      {units} {what} of group {group.name}.
    </p>
  );
}

/**
 * Practice units: the group's `_practice` units; for the questions checked,
 * coders are told after answering when they were wrong
 * (docs/architecture.md §6.2).
 */
export function PracticeEditor({
  practice,
  group,
  checkable,
  answerKey,
  canSpread,
  onChange,
}: {
  practice: PracticeSettings | undefined;
  group: SetGroupResponse | undefined;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  canSpread: boolean;
  onChange: (practice: PracticeSettings | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>
        <span className="flex items-center gap-1.5">Practice: units with feedback when a coder answers wrong</span>
        <PlacementSelect
          value={practice?.placement}
          canSpread={canSpread}
          firstLabel="First, a practice round (recommended)"
          onChange={(placement) => onChange(placement ? { ...practice, placement } : undefined)}
        />
      </label>
      {practice?.placement === "rate" && (
        <div className="flex flex-wrap items-end gap-3">
          <RateFields value={practice} onChange={(rate) => onChange({ ...practice, ...rate })} />
        </div>
      )}
      {practice && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
          <span className="text-xs font-semibold">Questions with feedback</span>
          <CheckedQuestions
            checkable={checkable}
            value={practice.questions ?? []}
            column={practiceColumn}
            onChange={(questions) => {
              const next: PracticeSettings = { ...practice, questions };
              if (questions.length === 0) delete next.questions;
              onChange(next);
            }}
          />
          {(practice.questions?.length ?? 0) > 0 && (
            <label className={labelClass}>
              Message when wrong (optional)
              <Input
                className="h-8 text-xs font-normal"
                placeholder="Default: the expected answer"
                value={practice.message ?? ""}
                onChange={(e) => {
                  const next: PracticeSettings = { ...practice, message: e.target.value };
                  if (!e.target.value) delete next.message;
                  onChange(next);
                }}
              />
              <span className="text-[11px] font-normal text-muted-foreground">
                May use $unit and $var. A unit&apos;s own message, per question, goes in the column{" "}
                <code>{practiceMessageColumn("question")}</code>. Practice units come with their answers (checked in the
                coder&apos;s browser, as each question is answered); $unit._practice tells a layout it shows a practice
                unit.
              </span>
            </label>
          )}
          {(practice.questions?.length ?? 0) > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={practice.retry !== false}
                onChange={(e) => {
                  const next: PracticeSettings = { ...practice, retry: false };
                  if (e.target.checked) delete next.retry;
                  onChange(next);
                }}
              />
              <span>
                Answer again until right
                <span className="block text-[11px] text-muted-foreground">
                  Off: coders see the message and may go on. Either way, how many tries each question took is in the
                  export.
                </span>
              </span>
            </label>
          )}
          <SpecialSetNote group={group} set={PRACTICE_SET} what="practice units" />
          {answerKey && group && (practice.questions?.length ?? 0) > 0 && (
            <RightAnswersButton
              context={answerKey}
              group={group.name}
              set={PRACTICE_SET}
              what="practice"
              questions={checkable.filter((q) => practice.questions!.includes(q.name))}
              column={practiceColumn}
              messageColumn={practiceMessageColumn}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gold units: the group's `_gold` units, checked silently; with health, too
 * many wrong answers end the session at a screen-out
 * (docs/architecture.md §6.2).
 */
export function GoldEditor({
  gold,
  group,
  checkable,
  answerKey,
  screenouts,
  canSpread,
  onChange,
}: {
  gold: GoldSettings | undefined;
  group: SetGroupResponse | undefined;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  screenouts: string[];
  canSpread: boolean;
  onChange: (gold: GoldSettings | undefined) => void;
}) {
  const health = gold?.health;
  const setHealth = (patch: Partial<NonNullable<GoldSettings["health"]>>) =>
    gold && health && onChange({ ...gold, health: { ...health, ...patch } });
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>
        <span className="flex items-center gap-1.5">Gold: units with a known answer, checked silently</span>
        <PlacementSelect
          value={gold?.placement}
          canSpread={canSpread}
          firstLabel="First, before the coder's own units"
          onChange={(placement) => onChange(placement ? { questions: [], ...gold, placement } : undefined)}
        />
      </label>
      {gold?.placement === "rate" && (
        <div className="flex flex-wrap items-end gap-3">
          <RateFields value={gold} onChange={(rate) => onChange({ ...gold, ...rate })} />
        </div>
      )}
      {gold && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
          <span className="text-xs font-semibold">Questions checked</span>
          <CheckedQuestions
            checkable={checkable}
            value={gold.questions}
            column={goldColumn}
            onChange={(questions) => onChange({ ...gold, questions })}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={health !== undefined}
              onChange={(e) => {
                const next = { ...gold };
                if (e.target.checked) next.health = { start: 5, wrong: -1, right: 0, end: screenouts[0] ?? "" };
                else delete next.health;
                onChange(next);
              }}
            />
            End the session when a coder answers too many wrong
          </label>
          {health && (
            <div className="flex flex-wrap items-end gap-3">
              <label className={labelClass}>
                Health at the start
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-24 text-xs font-normal"
                  value={health.start}
                  onChange={(e) => setHealth({ start: Number(e.target.value) })}
                />
              </label>
              <label className={labelClass}>
                Per wrong answer
                <Input
                  type="number"
                  max={-0.1}
                  step="any"
                  className="h-8 w-24 text-xs font-normal"
                  value={health.wrong}
                  onChange={(e) => setHealth({ wrong: Number(e.target.value) })}
                />
              </label>
              <label className={labelClass}>
                Per right answer
                <Input
                  type="number"
                  min={0}
                  step="any"
                  className="h-8 w-24 text-xs font-normal"
                  value={health.right ?? 0}
                  onChange={(e) => setHealth({ right: Number(e.target.value) || undefined })}
                />
              </label>
              <label className={labelClass}>
                At 0, end at
                <select
                  className={`${selectClass} font-normal`}
                  value={health.end}
                  onChange={(e) => setHealth({ end: e.target.value })}
                >
                  {!screenouts.includes(health.end) && (
                    <option value={health.end}>{health.end || "(add an end item that screens out)"}</option>
                  )}
                  {screenouts.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {health && health.wrong < 0 && (
            <p className="text-[11px] text-muted-foreground">
              Health never goes above its start. With these numbers a coder can answer{" "}
              {Math.ceil(health.start / -health.wrong) - 1} gold units wrong in a row; the next one ends their session.
            </p>
          )}
          <SpecialSetNote group={group} set={GOLD_SET} what="gold units" />
          {answerKey && group && gold.questions.length > 0 && (
            <RightAnswersButton
              context={answerKey}
              group={group.name}
              set={GOLD_SET}
              what="gold"
              questions={checkable.filter((q) => gold.questions.includes(q.name))}
              column={goldColumn}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Opens the answer-key dialog: the right answers of a group's gold or practice units. */
function RightAnswersButton({
  context,
  ...props
}: {
  context: AnswerKeyContext;
  group: string;
  set: string;
  what: string;
  questions: AnswerKeyQuestion[];
  column: (question: string) => string;
  messageColumn?: (question: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        {props.what === "gold" ? "Create gold values…" : "Write practice answers…"}
      </Button>
      {open && (
        <AnswerKeyDialog client={context.client} layout={context.layout} {...props} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
