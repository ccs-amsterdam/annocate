import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CodebookCode } from "@annotinder/contracts";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCodeValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type SelectCodeVariable = Extract<QuestionVariable, { type: "select_code" }>;

function getConditionValue(selectedCodes: CodebookCode[], multiple: boolean): string | string[] {
  const codes = selectedCodes.map((code) => code.code);
  return multiple ? codes : codes[0] ?? "";
}

function getShortcutLabel(index: number): string | null {
  return index < 9 ? String(index + 1) : null;
}

function getButtonStyle(code: CodebookCode, selected: boolean): CSSProperties | undefined {
  if (!code.color) return undefined;

  return selected
    ? { backgroundColor: code.color, borderColor: code.color, color: "#111827" }
    : { borderColor: code.color, color: code.color };
}

export function SelectCodeAnswerField({ variable, onAnswer }: AnswerFieldProps<SelectCodeVariable>) {
  const multiple = Boolean(variable.multiple);
  const [selectedCodes, setSelectedCodes] = useState<CodebookCode[]>([]);
  const selectedCodeNames = useMemo(() => new Set(selectedCodes.map((code) => code.code)), [selectedCodes]);

  useEffect(() => {
    setSelectedCodes([]);
  }, [variable]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const shortcutIndex = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(shortcutIndex) || shortcutIndex < 0 || shortcutIndex >= Math.min(variable.codes.length, 9)) return;

      event.preventDefault();
      const selectedCode = variable.codes[shortcutIndex];
      if (!selectedCode) return;

      if (!multiple) {
        onAnswer(buildCodeValue([{ code: selectedCode.code, value: selectedCode.value }]), selectedCode.code);
        return;
      }

      setSelectedCodes((current) => {
        const exists = current.some((code) => code.code === selectedCode.code);
        return exists ? current.filter((code) => code.code !== selectedCode.code) : [...current, selectedCode];
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [multiple, onAnswer, variable.codes]);

  function handleCodeClick(code: CodebookCode) {
    if (!multiple) {
      onAnswer(buildCodeValue([{ code: code.code, value: code.value }]), code.code);
      return;
    }

    setSelectedCodes((current) => {
      const exists = current.some((item) => item.code === code.code);
      return exists ? current.filter((item) => item.code !== code.code) : [...current, code];
    });
  }

  function handleSubmitSelection() {
    if (!selectedCodes.length) return;

    onAnswer(
      buildCodeValue(selectedCodes.map((code) => ({ code: code.code, value: code.value }))),
      getConditionValue(selectedCodes, multiple),
    );
  }

  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${variable.vertical ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {variable.codes.map((code, index) => {
          const selected = selectedCodeNames.has(code.code);
          const shortcut = getShortcutLabel(index);

          return (
            <Button
              key={code.code}
              type="button"
              variant={selected ? "default" : "outline"}
              className="h-auto min-h-16 justify-between gap-4 whitespace-normal px-4 py-3 text-left"
              style={getButtonStyle(code, selected)}
              onClick={() => handleCodeClick(code)}
            >
              <span className="flex flex-col items-start gap-1">
                <span className="font-medium">{code.code}</span>
                {code.value != null && <span className="text-xs opacity-70">Value {code.value}</span>}
              </span>
              <span className="flex items-center gap-2 text-xs opacity-80">
                {selected && <Check className="size-4" />}
                {shortcut && <span>{shortcut}</span>}
              </span>
            </Button>
          );
        })}
      </div>

      {multiple && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {selectedCodes.length ? `${selectedCodes.length} code${selectedCodes.length === 1 ? "" : "s"} selected` : "Select one or more codes."}
          </p>
          <Button type="button" size="lg" disabled={!selectedCodes.length} onClick={handleSubmitSelection}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
