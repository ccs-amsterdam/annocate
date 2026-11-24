import type { AnyVariableType, DesignIssue, DesignItem, InLoopQuestionItem } from "@annotinder/contracts";
import { HelpButton } from "../../../help/HelpButton";
import {
  switchVariableType,
  VARIABLE_TYPE_OPTIONS_USER,
  VARIABLE_TYPE_OPTIONS_UNIT,
} from "../../../design/answerTypes";
import { withComments } from "../../../design/itemSettings";
import { IssueList } from "../IssueList";
import { issuesAt } from "../issues";
import { TypeCardGrid, TypeHeader } from "../TypeCards";
import { answerTypeCards } from "../typeCardData";
import { VariableTypeForm } from "../VariableTypeForm";
import { FocusSelect, InstructionFields } from "./LoopQuestionFields";

type QuestionItem = Extract<DesignItem, { type: "question" }>;
type AvailableQuestion = { name: string; variable: AnyVariableType };

/** The help topic for each answer type. */
const TYPE_HELP: Record<AnyVariableType["type"], string> = {
  nominal: "nominal-and-ordinal",
  ordinal: "nominal-and-ordinal",
  numeric: "numeric",
  scale: "scale",
  annotinder: "swipe",
  confirm: "confirm",
  text: "open-answers",
  random: "random-condition",
  span: "span",
  relation: "relation",
  unspecified: "question-types",
};

/** What a question in a unit loop has besides: what its layouts show, and where its options can come from. */
export interface QuestionLoop {
  /** What the layouts before it show ("Show field"), and what span questions can select in. */
  names?: { shown: string[]; selectable: string[] };
  /** The unit fields of type list (a question can take its options from one). */
  listFields: string[];
}

/** A question's answer type and what it needs; in a loop also its instruction and focus. */
export function QuestionForm({
  item,
  loop,
  availableQuestions,
  stratifyChoices,
  issues,
  onChange,
}: {
  item: QuestionItem;
  /** The question is in a unit loop: loop answer types, an instruction and focus. */
  loop?: QuestionLoop;
  /** Questions references may use at this item. */
  availableQuestions: AvailableQuestion[];
  /** What a random condition's balanced draw can balance within. */
  stratifyChoices: string[];
  issues: DesignIssue[];
  onChange: (updated: DesignItem) => void;
}) {
  const cards = answerTypeCards(loop ? VARIABLE_TYPE_OPTIONS_UNIT : VARIABLE_TYPE_OPTIONS_USER);
  const pickType = (type: AnyVariableType["type"]) =>
    onChange({ ...item, variable: switchVariableType(item.variable, type) } as DesignItem);
  const setVariable = (variable: AnyVariableType) => onChange({ ...item, variable } as DesignItem);
  const type = item.variable.type;

  return (
    <>
      {type === "unspecified" ? (
        // A new question: choose what kind of answer it asks for
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">Choose an answer type</span>
            <HelpButton topic="question-types" label="Help: answer types" />
          </span>
          <TypeCardGrid cards={cards} onPick={pickType} />
        </div>
      ) : (
        <TypeHeader
          cards={cards}
          value={type as (typeof cards)[number]["type"]}
          onPick={pickType}
          help={<HelpButton topic={TYPE_HELP[type]} label="Help: this answer type" />}
        />
      )}
      {/* The rest of the form once the answer type is chosen */}
      {type !== "unspecified" && (
        <>
          <VariableTypeForm
            variable={item.variable}
            spanQuestions={spanQuestionsOf(availableQuestions)}
            layoutFields={loop?.names?.selectable}
            optionSources={loop ? optionSources(loop.listFields, availableQuestions) : []}
            stratifyChoices={stratifyChoices}
            onChange={setVariable}
          />
          {loop && (
            <InstructionFields item={item as InLoopQuestionItem} onChange={(next) => onChange(next as DesignItem)} />
          )}
          <label className="flex items-center gap-1.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(item.comments)}
              onChange={(e) => onChange(withComments(item, e.target.checked))}
            />
            Coders can add a comment
            <HelpButton topic="questions#comments" label="Help: comments" />
          </label>
          {loop?.names && <FocusSelect variable={item.variable} loopIds={loop.names.shown} onChange={setVariable} />}
        </>
      )}
      {/* Reference problems in the question and instruction texts, and others about the answer type */}
      <IssueList issues={[...issuesAt(issues, "variable"), ...issuesAt(issues, "instruction")]} />
    </>
  );
}

/** The span questions a relation question can relate the spans of. */
function spanQuestionsOf(questions: AvailableQuestion[]) {
  return questions.flatMap((q) => (q.variable.type === "span" ? [{ name: q.name, options: q.variable.options }] : []));
}

/** Where a loop question's options can come from besides its own list: a list field, or a span question's spans. */
function optionSources(listFields: string[], questions: AvailableQuestion[]) {
  return [
    ...listFields.map((f) => ({ from: `$unit.${f}`, label: `The unit's ${f} (a list field)` })),
    ...questions.flatMap((q) =>
      q.variable.type === "span" ? [{ from: `$var.${q.name}`, label: `The spans of ${q.name}` }] : [],
    ),
  ];
}
