import {
  NOMINAL_LAYOUTS,
  ORDINAL_LAYOUTS,
  convertOptionsLevel,
  type AnyVariableType,
  type NominalType,
  type UnitVariableType,
  type UserVariableType,
} from "@annotinder/contracts";

// The answer types the editor offers, their names, and switching a question between them.

export const VARIABLE_TYPE_OPTIONS_USER: UserVariableType["type"][] = [
  "nominal",
  "ordinal",
  "numeric",
  "scale",
  "annotinder",
  "confirm",
];

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
  random: "Random condition (drawn, not asked)",
  span: "Span (select text)",
  relation: "Relation (link spans)",
  unspecified: "Not chosen yet",
};

function defaultVariableForAnyType(type: string): AnyVariableType {
  switch (type) {
    case "nominal":
      return {
        type: "nominal",
        question: "",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      };
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
      return {
        type: "annotinder",
        question: "",
        options: [
          { value: "no", label: "No" },
          { value: "yes", label: "Yes" },
        ],
      };
    case "confirm":
      return { type: "confirm", question: "" };
    case "random":
      return { type: "random", draw: "random", options: [{ value: "control" }, { value: "experiment" }] };
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
    const layout =
      rest.layout && (type === "ordinal" ? ORDINAL_LAYOUTS : NOMINAL_LAYOUTS).some((l) => l === rest.layout)
        ? rest.layout
        : undefined;
    return { ...rest, type, layout, options: convertOptionsLevel(current.options, type) } as AnyVariableType;
  }
  const next = defaultVariableForAnyType(type);
  const { question, instruction } = current as { question?: string; instruction?: string };
  if ("question" in next) Object.assign(next, { question: question ?? "", ...(instruction ? { instruction } : {}) });
  return next;
}
