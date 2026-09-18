import type { CodebookItem, VariableValue } from "@annotinder/contracts";

interface QuestionProps {
  item: Extract<CodebookItem, { type: "user_variable" | "unit_variable" }>;
  onAnswer: (value: VariableValue, conditionValue?: unknown) => void;
}

/**
 * Minimal MVP question renderer, covering just enough variable types to
 * exercise the end-to-end flow (design plan Phase 3.4: session -> unit ->
 * answer -> post -> next unit -> finished). Phase 4 replaces this with the
 * full ported annotation UI (span/relation/scale/etc, see design plan §5).
 */
export function Question({ item, onAnswer }: QuestionProps) {
  const { variable } = item;

  if (variable.type === "confirm") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg">{variable.question}</p>
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          onClick={() => onAnswer({ done: true, skip: false }, true)}
        >
          Confirm
        </button>
      </div>
    );
  }

  if (variable.type === "select_code" || variable.type === "annotinder") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg">{variable.question}</p>
        <div className="flex flex-wrap gap-2">
          {variable.codes.map((code) => (
            <button
              key={code.code}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
              style={code.color ? { borderColor: code.color, color: code.color } : undefined}
              onClick={() => onAnswer({ done: true, skip: false, codes: [{ code: code.code }] }, code.code)}
            >
              {code.code}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {"question" in variable && <p className="text-lg">{variable.question}</p>}
      <p className="text-sm text-gray-500">
        Variable type &quot;{variable.type}&quot; isn&apos;t supported by this minimal renderer yet.
      </p>
      <button className="rounded border border-gray-300 px-4 py-2" onClick={() => onAnswer({ done: true, skip: true })}>
        Skip
      </button>
    </div>
  );
}
