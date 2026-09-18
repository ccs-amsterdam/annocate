import type { UnitVariableType, UserVariableType } from "@annotinder/contracts";
import { CodesEditor } from "./CodesEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type AnyVariableType = UserVariableType | UnitVariableType;

/** Just the shared `question`/`instruction` fields -- kept as a plain (non-union-derived) shape so
 * patches don't get incorrectly widened back into a cross-product union of every variable type
 * (a `Partial<Extract<Union, ...>>` distributes member-wise and reintroduces every variant's fields). */
interface QuestionFieldsValue {
  question: string;
  instruction?: string;
  instructionAuto?: boolean;
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
          placeholder="Markdown/QuickJS-templated question text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Instruction (optional)</label>
        <Textarea
          value={value.instruction ?? ""}
          onChange={(e) => onChange({ instruction: e.target.value || undefined })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!value.instructionAuto}
          onChange={(e) => onChange({ instructionAuto: e.target.checked || undefined })}
        />
        Show instruction automatically the first time
      </label>
    </>
  );
}

/**
 * Dispatches on `variable.type` to render the right sub-form (design plan
 * §5.2). Covers every `UserVariableType`/`UnitVariableType` variant
 * (variableTypes.ts). Less-common nested fields (`questionStyle`,
 * `instructionStyle`, `items` on `scale`) are intentionally not exposed here
 * yet -- see design plan §5 STILL OPEN notes.
 */
export function VariableTypeForm({
  variable,
  onChange,
  unitVariableNames,
}: {
  variable: AnyVariableType;
  onChange: (next: AnyVariableType) => void;
  /** Sibling `unit_variable` names in the same codebook, for `relation`'s from/to variable pickers. */
  unitVariableNames?: string[];
}) {
  switch (variable.type) {
    case "annotinder": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <CodesEditor codes={v.codes} max={3} onChange={(codes) => onChange({ ...v, codes })} />
        </>
      );
    }
    case "scale": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <CodesEditor codes={v.codes} onChange={(codes) => onChange({ ...v, codes })} />
        </>
      );
    }
    case "select_code":
    case "search_code": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <CodesEditor codes={v.codes} onChange={(codes) => onChange({ ...v, codes })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!v.multiple}
              onChange={(e) => onChange({ ...v, multiple: e.target.checked || undefined })}
            />
            Allow multiple selections
          </label>
          {v.type === "select_code" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!v.vertical}
                onChange={(e) => onChange({ ...v, vertical: e.target.checked || undefined })}
              />
              Vertical layout
            </label>
          )}
        </>
      );
    }
    case "confirm": {
      const v = variable;
      return <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />;
    }
    case "auto": {
      const v = variable;
      return (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Source</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={v.source}
              onChange={(e) => onChange({ ...v, source: e.target.value as "random" | "url_param" })}
            >
              <option value="random">Random draw</option>
              <option value="url_param">URL parameter</option>
            </select>
          </div>
          {v.source === "url_param" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">URL parameter name</label>
              <Input value={v.urlParam ?? ""} onChange={(e) => onChange({ ...v, urlParam: e.target.value })} />
            </div>
          )}
          {v.source === "random" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Options (code, optional weight)</label>
              {(v.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="code"
                    value={opt.code}
                    onChange={(e) => {
                      const options = [...(v.options ?? [])];
                      options[i] = { ...opt, code: e.target.value };
                      onChange({ ...v, options });
                    }}
                    className="w-32"
                  />
                  <Input
                    placeholder="weight"
                    type="number"
                    value={opt.weight ?? ""}
                    onChange={(e) => {
                      const options = [...(v.options ?? [])];
                      options[i] = { ...opt, weight: e.target.value === "" ? undefined : Number(e.target.value) };
                      onChange({ ...v, options });
                    }}
                    className="w-20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onChange({ ...v, options: (v.options ?? []).filter((_, j) => j !== i) })}
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
                onClick={() => onChange({ ...v, options: [...(v.options ?? []), { code: "" }] })}
              >
                + Add option
              </Button>
            </div>
          )}
        </>
      );
    }
    case "span": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Column / constant to tokenize</label>
            <Input
              value={v.column}
              onChange={(e) => onChange({ ...v, column: e.target.value })}
              placeholder="Must match a ::tokenize[name] in the unit_loop layout"
            />
          </div>
          <CodesEditor codes={v.codes} onChange={(codes) => onChange({ ...v, codes })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!v.editMode}
              onChange={(e) => onChange({ ...v, editMode: e.target.checked || undefined })}
            />
            Edit mode (allow re-editing existing spans)
          </label>
        </>
      );
    }
    case "relation": {
      const v = variable;
      return (
        <>
          <QuestionFields value={v} onChange={(patch) => onChange({ ...v, ...patch })} />
          <CodesEditor codes={v.codes} onChange={(codes) => onChange({ ...v, codes })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">From (span variable)</label>
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
              <label className="text-sm font-medium">To (span variable)</label>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!v.editMode}
              onChange={(e) => onChange({ ...v, editMode: e.target.checked || undefined })}
            />
            Edit mode
          </label>
        </>
      );
    }
    default:
      return null;
  }
}

export const VARIABLE_TYPE_OPTIONS_USER: UserVariableType["type"][] = [
  "annotinder",
  "scale",
  "select_code",
  "search_code",
  "confirm",
  "auto",
];
export const VARIABLE_TYPE_OPTIONS_UNIT: UnitVariableType["type"][] = [
  "annotinder",
  "scale",
  "select_code",
  "search_code",
  "confirm",
  "span",
  "relation",
];

export function defaultVariableForAnyType(type: string): AnyVariableType {
  switch (type) {
    case "annotinder":
      return { type: "annotinder", question: "", codes: [{ code: "yes" }, { code: "no" }] };
    case "scale":
      return { type: "scale", question: "", codes: [{ code: "1" }, { code: "2" }, { code: "3" }] };
    case "select_code":
      return { type: "select_code", question: "", codes: [{ code: "option 1" }] };
    case "search_code":
      return { type: "search_code", question: "", codes: [{ code: "option 1" }] };
    case "confirm":
      return { type: "confirm", question: "" };
    case "auto":
      return { type: "auto", source: "random", options: [{ code: "control" }, { code: "experiment" }] };
    case "span":
      return { type: "span", question: "", column: "", codes: [{ code: "label 1" }] };
    case "relation":
      return {
        type: "relation",
        question: "",
        codes: [{ code: "relation 1" }],
        from: { variable: "" },
        to: { variable: "" },
      };
    default:
      throw new Error(`Unknown variable type: ${type}`);
  }
}
