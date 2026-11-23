import { useState } from "react";
import {
  CODER_SET,
  TEST_SET,
  answerColumn,
  feedbackColumn,
  type GoldCheck,
  type Invite,
  type LoopUnits,
  type Placement,
  type PracticeCheck,
  type SetGroupResponse,
  type TestSetType,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpButton } from "../../../help/HelpButton";
import { AnswerKeyDialog, type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import { selectClass, labelClass, testCount, type AnswerKeyContext } from "./helpers";

// The test units of a unit loop (`test_set`: overlap, practice, gold):
// where they go among the coder's own units, and the checks on practice and
// gold units (right answers in `answer_<q>`, feedback in `feedback_<q>`).

/**
 * A loop's coding and test units: whether the coding units are included,
 * where each type of test unit goes, and the checks on practice and gold units.
 */
export function TestUnitsEditor({
  units: settings,
  groups,
  invite,
  checkable,
  answerKey,
  screenouts,
  onChange,
}: {
  units: LoopUnits;
  groups: SetGroupResponse[];
  invite: Invite;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  /** The design's end items with outcome `screenout`: where gold checks can end a session. */
  screenouts: string[];
  onChange: (units: LoopUnits) => void;
}) {
  const tests = groups.find((g) => g.name === TEST_SET);
  const count = (type: TestSetType) => testCount(groups, type);
  const set = <K extends keyof LoopUnits>(key: K, value: LoopUnits[K] | undefined) => {
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const shows = (kind: "practice" | "gold", check: unknown) =>
    settings[kind] !== "ignore" && (count(kind) > 0 || check !== undefined);
  // Specific coders: the units in the coder set; otherwise all units (test units aside)
  const coders = invite.mode === "coders" ? groups.find((g) => g.name === CODER_SET) : undefined;
  const codingCount = coders ? new Set(coders.sets.flatMap((s) => s.unitIds)).size : null;
  return (
    <>
      <p className="text-[11px] text-muted-foreground">
        {tests ? (
          <>
            Where the units&apos; test units (<span className="font-mono">test_set</span>) go among the coding units.
            Spread throughout a divided crowd&apos;s units without a maximum of units per coder: about one in ten.
          </>
        ) : (
          "The units have no test units (test_set) yet: mark them on the Units page, or with the coder set dialog."
        )}
      </p>
      <div className="grid w-fit grid-cols-[auto_2.5rem_auto] items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold">Coding units</span>
        <span
          className="text-right font-mono text-[11px] text-muted-foreground"
          title={coders ? "Units in the coder set" : "The units that aren't test units"}
        >
          {codingCount ?? "all"}
        </span>
        <select
          className={`${selectClass} w-fit font-normal`}
          aria-label="Coding units"
          value={settings.coding === false ? "no" : "yes"}
          onChange={(e) => set("coding", e.target.value === "no" ? false : undefined)}
        >
          <option value="yes">Include</option>
          <option value="no">Leave out (only test units)</option>
        </select>
        <PlacementRow
          label="Overlap units"
          help="overlap"
          count={count("overlap")}
          value={settings.overlap}
          onChange={(p) => set("overlap", p === "spread" ? undefined : p)}
        />
        <PlacementRow
          label="Practice units"
          count={count("practice")}
          value={settings.practice}
          onChange={(p) => set("practice", p === "spread" ? undefined : p)}
        />
        <PlacementRow
          label="Gold units"
          help="special-units"
          count={count("gold")}
          value={settings.gold}
          onChange={(p) => set("gold", p === "spread" ? undefined : p)}
        />
      </div>
      {shows("practice", settings.practiceCheck) && (
        <PracticeChecks
          check={settings.practiceCheck}
          checkable={checkable}
          answerKey={answerKey}
          onChange={(check) => set("practiceCheck", check)}
        />
      )}
      {shows("gold", settings.goldCheck) && (
        <GoldChecks
          check={settings.goldCheck}
          checkable={checkable}
          answerKey={answerKey}
          screenouts={screenouts}
          onChange={(check) => set("goldCheck", check)}
        />
      )}
    </>
  );
}

/**
 * Where a loop puts one type of test unit (contracts `PlacementSchema`):
 * a row with the number of such units and a select.
 */
function PlacementRow({
  label,
  help,
  count,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  /** How many test units of this type the units have (none: the setting is disabled). */
  count: number;
  value: Placement | undefined;
  onChange: (placement: Placement) => void;
}) {
  return (
    <>
      <span className={`flex items-center gap-1.5 text-xs font-semibold ${count === 0 ? "text-muted-foreground" : ""}`}>
        {label}
        {help && <HelpButton topic={help} label={`Help: ${label.toLowerCase()}`} />}
      </span>
      <span className="text-right font-mono text-[11px] text-muted-foreground" title="Units of this type in test_set">
        {count}
      </span>
      <select
        className={`${selectClass} w-fit font-normal`}
        aria-label={label}
        disabled={count === 0}
        title={count === 0 ? "The units have none of these test units" : undefined}
        value={value ?? "spread"}
        onChange={(e) => onChange(e.target.value as Placement)}
      >
        <option value="spread">Spread throughout</option>
        <option value="before">Before coding units</option>
        <option value="after">After coding units</option>
        <option value="ignore">Leave out</option>
      </select>
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

/**
 * The checks on practice units (contracts `PracticeCheckSchema`): for the
 * questions checked, coders are told after answering when they were wrong
 * (docs/architecture.md §6.2).
 */
function PracticeChecks({
  check,
  checkable,
  answerKey,
  onChange,
}: {
  check: PracticeCheck | undefined;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  onChange: (check: PracticeCheck | undefined) => void;
}) {
  const practice = check ?? {};
  const questions = practice.questions ?? [];
  const update = (next: PracticeCheck) => onChange(Object.keys(next).length > 0 ? next : undefined);
  return (
    <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
      <span className="text-xs font-semibold">Practice units: questions with feedback when a coder answers wrong</span>
      <CheckedQuestions
        checkable={checkable}
        value={questions}
        column={answerColumn}
        onChange={(list) => {
          const next: PracticeCheck = { ...practice, questions: list };
          if (list.length === 0) delete next.questions;
          update(next);
        }}
      />
      {questions.length > 0 && (
        <label className={labelClass}>
          Message when wrong (optional)
          <Input
            className="h-8 text-xs font-normal"
            placeholder="Default: the expected answer"
            value={practice.message ?? ""}
            onChange={(e) => {
              const next: PracticeCheck = { ...practice, message: e.target.value };
              if (!e.target.value) delete next.message;
              update(next);
            }}
          />
          <span className="text-[11px] font-normal text-muted-foreground">
            May use $unit and $var. A unit&apos;s own message, per question, goes in the column{" "}
            <code>{feedbackColumn("question")}</code>. $unit.test_set is &quot;practice&quot; on practice units (for a
            note in the layout).
          </span>
        </label>
      )}
      {questions.length > 0 && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={practice.retry !== false}
            onChange={(e) => {
              const next: PracticeCheck = { ...practice, retry: false };
              if (e.target.checked) delete next.retry;
              update(next);
            }}
          />
          <span>
            Answer again until right
            <span className="block text-[11px] text-muted-foreground">
              Off: coders see the message and may go on. Either way, how many tries each question took is in the export.
            </span>
          </span>
        </label>
      )}
      {answerKey && questions.length > 0 && (
        <RightAnswersButton
          context={answerKey}
          group={TEST_SET}
          set="practice"
          what="practice"
          questions={checkable.filter((q) => questions.includes(q.name))}
          column={answerColumn}
          messageColumn={feedbackColumn}
        />
      )}
    </div>
  );
}

/**
 * The checks on gold units (contracts `GoldCheckSchema`), silent; with
 * health, too many wrong answers end the session at a screen-out
 * (docs/architecture.md §6.2).
 */
function GoldChecks({
  check,
  checkable,
  answerKey,
  screenouts,
  onChange,
}: {
  check: GoldCheck | undefined;
  checkable: AnswerKeyQuestion[];
  answerKey?: AnswerKeyContext;
  screenouts: string[];
  onChange: (check: GoldCheck | undefined) => void;
}) {
  const questions = check?.questions ?? [];
  const health = check?.health;
  const setHealth = (patch: Partial<NonNullable<GoldCheck["health"]>>) =>
    check && health && onChange({ ...check, health: { ...health, ...patch } });
  return (
    <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
      <span className="text-xs font-semibold">Gold units: questions checked silently</span>
      <CheckedQuestions
        checkable={checkable}
        value={questions}
        column={answerColumn}
        onChange={(list) => onChange(list.length > 0 ? { ...check, questions: list } : undefined)}
      />
      {check && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={health !== undefined}
            onChange={(e) => {
              const next = { ...check };
              if (e.target.checked) next.health = { start: 5, wrong: -1, right: 0, end: screenouts[0] ?? "" };
              else delete next.health;
              onChange(next);
            }}
          />
          End the session when a coder answers too many wrong
        </label>
      )}
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
      {answerKey && questions.length > 0 && (
        <RightAnswersButton
          context={answerKey}
          group={TEST_SET}
          set="gold"
          what="gold"
          questions={checkable.filter((q) => questions.includes(q.name))}
          column={answerColumn}
        />
      )}
    </div>
  );
}

/** Opens the answer-key dialog: the right answers of the gold or practice units. */
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
