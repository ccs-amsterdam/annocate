import type { ResearcherApi } from "../../api/httpResearcherApi";
import type { AnyVariableType, DesignItem, SetGroupResponse, DesignIssue, UrlParam } from "@annotinder/contracts";
import { UnitLoopForm } from "./UnitLoopForm";
import { LayoutForm } from "./unitLoop/LayoutForm";
import { SessionItemForm } from "./SessionItemForm";
import { EditedQuestionContext } from "../../design/deployedValues";
import type { LoopUnitsContext } from "../../design/assignment";
import { EndItemFields } from "./itemForm/EndItemFields";
import { BranchForm, LoopConditionField } from "./itemForm/ConditionFields";
import { ExperimentForm } from "./itemForm/ExperimentForm";
import { LabelField, NameField } from "./itemForm/NameFields";
import { QuestionForm } from "./itemForm/QuestionForm";

interface ItemFormProps {
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
  /** The unit fields of type list (a question can take its options from one). */
  listFields?: string[];
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
}

/**
 * The form of the item selected in the design editor's tree: its name (or
 * label), and what its type needs: a question's answer type, a loop's
 * units, a layout, a branch's condition, an end, or the Study entry.
 */
export function ItemForm(props: ItemFormProps) {
  const { item } = props;
  return (
    // Which question this is: its options' deployed values don't follow label edits (OptionsEditor)
    <EditedQuestionContext.Provider value={"name" in item ? item.name : null}>
      <div className="flex flex-col gap-4">
        <ItemFields {...props} />
      </div>
    </EditedQuestionContext.Provider>
  );
}

/** The fields of the item's type. */
function ItemFields({
  item,
  client,
  groups,
  sessionValueNames = [],
  availableQuestions = [],
  inLoop = false,
  loopItems = [],
  unitFields = [],
  listFields = [],
  loopNames,
  readOnly = false,
  validationIssues = [],
  screenouts = [],
  unitsContext,
  urlParams = [],
  onChange,
}: ItemFormProps) {
  const nameError = validationIssues.find((i) => i.path.includes("name"))?.message ?? null;
  // What a random condition's balanced draw can balance within
  const stratifyChoices = [...availableQuestions.map((q) => q.name), ...sessionValueNames.map((n) => `session.${n}`)];
  const condition = { questions: availableQuestions, inLoop, issues: validationIssues, onChange };

  switch (item.type) {
    case "session":
      return (
        <SessionItemForm item={item} groups={groups} issues={validationIssues} client={client} onChange={onChange} />
      );
    case "question":
      return (
        <>
          <NameField item={item} error={nameError} onChange={onChange} />
          <QuestionForm
            item={item}
            loop={inLoop ? { names: loopNames, listFields } : undefined}
            availableQuestions={availableQuestions}
            stratifyChoices={stratifyChoices}
            issues={validationIssues}
            onChange={onChange}
          />
        </>
      );
    case "experiment":
      return (
        <>
          <NameField item={item} error={nameError} onChange={onChange} />
          <ExperimentForm
            item={item}
            stratifyChoices={stratifyChoices}
            experiment={{ groups, urlParams, client }}
            issues={validationIssues}
            onChange={onChange}
          />
        </>
      );
    case "end":
      return (
        <>
          <NameField item={item} error={nameError} onChange={onChange} />
          <EndItemFields item={item} onChange={onChange} issues={validationIssues} />
        </>
      );
    case "layout":
      return (
        <>
          <LabelField item={item} onChange={onChange} />
          <LayoutForm
            layout={item}
            loopItems={loopItems}
            unitFields={unitFields}
            coderQuestions={availableQuestions}
            issues={validationIssues}
            readOnly={readOnly}
            onChange={onChange}
          />
        </>
      );
    case "unit_loop":
      return (
        <>
          <LabelField item={item} onChange={onChange} />
          <UnitLoopForm
            loop={item}
            client={client}
            groups={groups}
            screenouts={screenouts}
            validationIssues={validationIssues}
            unitsContext={unitsContext}
            onChange={onChange}
          />
          <LoopConditionField item={item} {...condition} />
        </>
      );
    case "branch":
      return (
        <>
          <LabelField item={item} onChange={onChange} />
          <BranchForm item={item} {...condition} />
        </>
      );
  }
}
