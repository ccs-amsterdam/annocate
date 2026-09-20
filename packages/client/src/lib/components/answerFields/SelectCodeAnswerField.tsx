import { useEffect, useMemo, useState } from "react";
import type { CodebookCode } from "@annotinder/contracts";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCodeValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { getCodeButtonStyle } from "../../utils/color";
import { useCoderSettings } from "../../context/CoderSettingsContext";
import { ShortcutBadge } from "../ShortcutBadge";

type SelectCodeVariable = Extract<QuestionVariable, { type: "select_code" }>;

function getConditionValue(selectedCodes: CodebookCode[], multiple: boolean): string | string[] {
  const codes = selectedCodes.map((code) => code.code);
  return multiple ? codes : codes[0] ?? "";
}

function getShortcutLabel(index: number): string | null {
  return index < 9 ? String(index + 1) : null;
}

export function SelectCodeAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<SelectCodeVariable>) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";
  const multiple = Boolean(variable.multiple);

  const initialCodes = useMemo(() => {
    if (!initialValue || !("codes" in initialValue) || !Array.isArray(initialValue.codes)) return [];
    const codeMap = new Map(variable.codes.map((c) => [c.code, c]));
    return (initialValue.codes as { code: string }[])
      .map((c) => codeMap.get(c.code))
      .filter((c): c is CodebookCode => c !== undefined);
  }, [initialValue, variable.codes]);

  const [selectedCodes, setSelectedCodes] = useState<CodebookCode[]>(initialCodes);
  const selectedCodeNames = useMemo(() => new Set(selectedCodes.map((code) => code.code)), [selectedCodes]);

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
    <div className="space-y-2.5 sm:space-y-3">
      <div className={`grid gap-2 sm:gap-2.5 ${variable.vertical ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {variable.codes.map((code, index) => {
          const selected = selectedCodeNames.has(code.code);
          const shortcut = getShortcutLabel(index);
          const customStyle = getCodeButtonStyle(code.color, selected, isDark);

          return (
            <Button
              key={code.code}
              type="button"
              variant={selected ? "default" : "outline"}
              className={`relative h-auto min-h-11 sm:min-h-12 justify-between gap-3 whitespace-normal px-3.5 py-2 sm:px-4 sm:py-2.5 text-left transition-all ${
                customStyle ? "" : selected ? "border-primary" : "border-border hover:bg-muted/50"
              }`}
              style={customStyle}
              onClick={() => handleCodeClick(code)}
            >
              {shortcut && <ShortcutBadge shortcut={shortcut} />}
              <span className="flex flex-col items-start gap-0.5 min-w-0">
                <span className="font-medium text-sm leading-snug truncate w-full">{code.code}</span>
                {code.value != null && <span className="text-[11px] opacity-70">Value {code.value}</span>}
              </span>
              <span className="flex items-center gap-1.5 text-xs opacity-80 shrink-0">
                {selected && <Check className="size-3.5" />}
              </span>
            </Button>
          );
        })}
      </div>

      {multiple && (
        <div className="flex justify-end pt-1">
          <Button type="button" onClick={handleSubmitSelection} disabled={!selectedCodes.length}>
            Submit ({selectedCodes.length})
          </Button>
        </div>
      )}
    </div>
  );
}
