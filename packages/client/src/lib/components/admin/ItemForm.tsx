import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  type AnyVariableType,
  type DesignItem,
  type Condition,
  type UnitLoopItem,
  type SessionItem,
  type SetGroupResponse,
  type DesignIssue,
  type EndItem,
  type InLoopQuestionItem,
  type LayoutItem,
  type UrlParam,
} from "@annotinder/contracts";
import { UnitLoopForm } from "./UnitLoopForm";
import { LayoutForm } from "./unitLoop/LayoutForm";
import { SessionItemForm } from "./SessionItemForm";
import { EditedQuestionContext } from "../../design/deployedValues";
import { HelpButton } from "../../help/HelpButton";
import { ConditionEditor } from "./ConditionEditor";
import { IssueList } from "./IssueList";
import { issuesAt } from "./issues";
import { Input } from "@/components/ui/input";
import type { LoopUnitsContext } from "../../design/assignment";
import { VariableTypeForm } from "./VariableTypeForm";
import { switchVariableType, VARIABLE_TYPE_OPTIONS_USER, VARIABLE_TYPE_OPTIONS_UNIT } from "../../design/answerTypes";
import { TypeCardGrid, TypeHeader } from "./TypeCards";
import { answerTypeCards } from "./typeCardData";
import { EndItemFields } from "./itemForm/EndItemFields";
import { FocusSelect, InstructionFields } from "./itemForm/LoopQuestionFields";

/** The help topic for each answer type. */
const TYPE_HELP: Record<AnyVariableType["type"], string> = {
  nominal: "nominal-and-ordinal",
  ordinal: "nominal-and-ordinal",
  numeric: "numeric",
  scale: "scale",
  annotinder: "swipe",
  confirm: "confirm",
  random: "random-condition",
  span: "span",
  relation: "relation",
  unspecified: "question-types",
};

/**
 * The form of the item selected in the design editor's tree: its name (or
 * label), and what its type needs: a question's answer type, a loop's
 * units, a layout, a branch's condition, an end, or the Study entry.
 */
export function ItemForm({
  item,
  client,
  groups,
  sessionValueNames = [],
  availableQuestions = [],
  inLoop = false,
  loopItems = [],
  unitFields = [],
  loopNames,
  readOnly = false,
  validationIssues = [],
  screenouts = [],
  unitsContext,
  urlParams = [],
  onChange,
}: {
  item: DesignItem;
  /** For the forms that ask the server (the Study entry's, a loop's right answers); absent: read only. */
  client?: ResearcherApi;
  /** The units' columns with a role (coder_set, condition_set, part_set, test_set). */
  groups: SetGroupResponse[];
  /** The `$session` names (declared and built-in). */
  sessionValueNames?: string[];
  /** Questions references may use at this item (contracts `availableQuestions`): for conditions and balancing. */
  availableQuestions?: { name: string; variable: AnyVariableType }[];
  /** The item is inside a unit loop: loop answer types, an instruction and focus; conditions may use `$unit`. */
  inLoop?: boolean;
  /** In a loop: its items (as saved), for a layout's questions. */
  loopItems?: DesignItem[];
  /** The study's unit fields (completions in a layout's template). */
  unitFields?: string[];
  /** For a question in a loop: what the layouts before it show ("Show field"), and what span questions can select in. */
  loopNames?: { shown: string[]; selectable: string[] };
  readOnly?: boolean;
  validationIssues?: DesignIssue[];
  /** The design's screen-out end items (a loop's gold checks can end there). */
  screenouts?: string[];
  /** For a unit loop: the who codes, what selects a session's units, the loops before it. */
  unitsContext?: LoopUnitsContext;
  /** The Study entry's URL parameters (an experiment can take its condition from one). */
  urlParams?: UrlParam[];
  onChange: (updated: DesignItem) => void;
}) {
  const nameError = validationIssues.find((i) => i.path.includes("name"))?.message ?? null;
  const answerCards = answerTypeCards(inLoop ? VARIABLE_TYPE_OPTIONS_UNIT : VARIABLE_TYPE_OPTIONS_USER);
  // What a random condition's balanced draw can balance within
  const stratifyChoices = [...availableQuestions.map((q) => q.name), ...sessionValueNames.map((n) => `session.${n}`)];

  return (
    // Which question this is: its options' deployed values don't follow label edits (OptionsEditor)
    <EditedQuestionContext.Provider value={"name" in item ? item.name : null}>
      <div className="flex flex-col gap-4">
        {item.type === "session" ? (
          <SessionItemForm
            item={item as SessionItem}
            groups={groups}
            issues={validationIssues}
            client={client}
            onChange={onChange}
          />
        ) : item.type === "branch" || item.type === "unit_loop" || item.type === "layout" ? (
          // Branches, unit loops and layouts have no name: an optional label shows in the tree (and for loops in exports).
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-foreground">Label (optional)</label>
              <HelpButton
                topic={
                  item.type === "branch" ? "conditions" : item.type === "layout" ? "layout-templates" : "unit-loops"
                }
                label="Help"
              />
            </span>
            <Input
              value={item.label ?? ""}
              onChange={(e) => onChange({ ...item, label: e.target.value || undefined })}
              placeholder={
                item.type === "branch"
                  ? "e.g. Screen-out"
                  : item.type === "layout"
                    ? "e.g. With the full text"
                    : "e.g. News items"
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-foreground">Item Name</label>
              <HelpButton
                topic={
                  item.type === "end" ? "end-items" : item.type === "experiment" ? "random-condition" : "questions"
                }
                label="Help"
              />
            </span>
            <Input
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              placeholder="e.g. sentiment, age"
              className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
        )}

        {item.type === "question" && (
          <>
            {item.variable.type === "unspecified" ? (
              // A new question: choose what kind of answer it asks for
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Choose an answer type</span>
                  <HelpButton topic="question-types" label="Help: answer types" />
                </span>
                <TypeCardGrid
                  cards={answerCards}
                  onPick={(type) =>
                    onChange({ ...item, variable: switchVariableType(item.variable, type) } as DesignItem)
                  }
                />
              </div>
            ) : (
              <TypeHeader
                cards={answerCards}
                value={item.variable.type as (typeof answerCards)[number]["type"]}
                onPick={(type) =>
                  onChange({ ...item, variable: switchVariableType(item.variable, type) } as DesignItem)
                }
                help={<HelpButton topic={TYPE_HELP[item.variable.type]} label="Help: this answer type" />}
              />
            )}
            <VariableTypeForm
              variable={item.variable}
              spanQuestions={availableQuestions.flatMap((q) =>
                q.variable.type === "span" ? [{ name: q.name, options: q.variable.options }] : [],
              )}
              layoutFields={inLoop ? loopNames?.selectable : undefined}
              stratifyChoices={stratifyChoices}
              onChange={(variable) => onChange({ ...item, variable } as DesignItem)}
            />
            {inLoop && (
              <InstructionFields item={item as InLoopQuestionItem} onChange={(next) => onChange(next as DesignItem)} />
            )}
            {inLoop && loopNames && (
              <FocusSelect
                variable={item.variable}
                loopIds={loopNames.shown}
                onChange={(variable) => onChange({ ...item, variable } as DesignItem)}
              />
            )}
            {/* Reference problems in the question and instruction texts, and others about the answer type */}
            <IssueList
              issues={[...issuesAt(validationIssues, "variable"), ...issuesAt(validationIssues, "instruction")]}
            />
          </>
        )}

        {item.type === "experiment" && (
          <>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Each coder gets one condition, drawn when they reach this point; never shown to the coder.
              <HelpButton topic="random-condition" label="Help: experiments" />
            </p>
            <VariableTypeForm
              variable={item.variable}
              stratifyChoices={stratifyChoices}
              experiment={{ groups, urlParams, client }}
              onChange={(variable) => onChange({ ...item, variable } as DesignItem)}
            />
            <IssueList issues={issuesAt(validationIssues, "variable")} />
          </>
        )}

        {item.type === "layout" && (
          <LayoutForm
            layout={item as LayoutItem}
            loopItems={loopItems}
            unitFields={unitFields}
            coderQuestions={availableQuestions}
            issues={validationIssues}
            readOnly={readOnly}
            onChange={(layout) => onChange(layout)}
          />
        )}

        {item.type === "unit_loop" && (
          <UnitLoopForm
            loop={item as UnitLoopItem}
            client={client}
            groups={groups}
            screenouts={screenouts}
            validationIssues={validationIssues}
            unitsContext={unitsContext}
            onChange={(loop) => onChange(loop)}
          />
        )}

        {item.type === "end" && <EndItemFields item={item as EndItem} onChange={onChange} issues={validationIssues} />}

        {item.type === "branch" && (
          // A branch's condition: required (a new branch's is empty until set; validation says so)
          <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
            <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
              Only show these items if…
              <HelpButton topic="conditions" label="Help: conditions" />
            </span>
            <ConditionEditor
              condition={item.condition ?? { script: "" }}
              onChange={(condition) => onChange({ ...item, condition })}
              questions={availableQuestions}
              loop={inLoop}
              issues={issuesAt(validationIssues, "condition")}
            />
          </div>
        )}

        {item.type === "unit_loop" && (
          // A loop's condition: optional (absent: coders always get the loop)
          <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={item.condition !== undefined}
                onChange={(e) => {
                  const next = { ...item, condition: e.target.checked ? { script: "true" } : undefined } as DesignItem;
                  if (!e.target.checked) delete (next as { condition?: Condition }).condition;
                  onChange(next);
                }}
              />
              Only give coders this loop if…
              <HelpButton topic="conditions" label="Help: conditions" />
            </label>
            {item.condition && (
              <ConditionEditor
                condition={item.condition}
                onChange={(condition) => onChange({ ...item, condition } as DesignItem)}
                questions={availableQuestions}
                loop={inLoop}
                issues={issuesAt(validationIssues, "condition")}
              />
            )}
          </div>
        )}
      </div>
    </EditedQuestionContext.Provider>
  );
}
