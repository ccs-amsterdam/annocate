import type { ReactNode } from "react";
import type { AnyVariableType } from "@annotinder/contracts";
import type { OptionSource } from "./OptionsEditor";
import { QuestionField } from "./variableType/QuestionField";
import { CategoricalFields } from "./variableType/CategoricalFields";
import { NumericFields } from "./variableType/NumericFields";
import { RelationFields, ScaleFields, SpanQuestionFields, SwipeFields, TextFields } from "./variableType/OtherFields";
import { RandomConditionFields, type ExperimentContext } from "./variableType/RandomConditionFields";
import type { SpanQuestion } from "./variableType/RelationRules";

/**
 * The form for a question's answer type (docs/client.md §4 "Types"): the
 * question text and what its type needs (options, a range, ...); the parts
 * are in `variableType/`. A variable's `questionStyle` is edited as JSON
 * only.
 */
export function VariableTypeForm(props: VariableTypeFormProps) {
  const { variable, onChange } = props;
  // A random condition is drawn, not asked
  if (variable.type === "experiment" || variable.type === "unspecified") return <TypeFields {...props} />;
  return (
    <>
      <QuestionField value={variable} onChange={(patch) => onChange({ ...variable, ...patch })} />
      <TypeFields {...props} />
    </>
  );
}

interface VariableTypeFormProps {
  variable: AnyVariableType;
  onChange: (next: AnyVariableType) => void;
  /** For a relation question: the span questions before it in its loop, with their labels. */
  spanQuestions?: SpanQuestion[];
  /** In a loop: what span questions can select in (`unit.<field>` shown as plain text, ::: text blocks). */
  layoutFields?: string[];
  /** Where a category question can take options from (`optionsFrom`): list fields, earlier span questions. */
  optionSources?: OptionSource[];
  /** For a random condition: what a balanced draw can balance within (earlier questions, `session.<name>`). */
  stratifyChoices?: string[];
  /** For an experiment: the units' role columns, the URL parameters, the API (to make a condition set). */
  experiment?: ExperimentContext;
}

/** What the answer type needs besides the question text. */
function TypeFields({
  variable,
  onChange,
  spanQuestions = [],
  layoutFields,
  optionSources = [],
  stratifyChoices = [],
  experiment,
}: VariableTypeFormProps): ReactNode {
  switch (variable.type) {
    case "nominal":
    case "ordinal":
      return <CategoricalFields variable={variable} sources={optionSources} onChange={onChange} />;
    case "numeric":
      return <NumericFields variable={variable} onChange={onChange} />;
    case "scale":
      return <ScaleFields variable={variable} onChange={onChange} />;
    case "swipe":
      return <SwipeFields variable={variable} onChange={onChange} />;
    case "text":
      return <TextFields variable={variable} onChange={onChange} />;
    case "experiment":
      return (
        <RandomConditionFields
          variable={variable}
          stratifyChoices={stratifyChoices}
          experiment={experiment}
          onChange={onChange}
        />
      );
    case "span":
      return <SpanQuestionFields variable={variable} layoutFields={layoutFields} onChange={onChange} />;
    case "relation":
      return <RelationFields variable={variable} spanQuestions={spanQuestions} onChange={onChange} />;
    case "confirm":
    case "unspecified":
      // A confirm question is only its text; an unspecified one isn't asked yet (ItemForm shows the answer types)
      return null;
    default:
      return null;
  }
}
