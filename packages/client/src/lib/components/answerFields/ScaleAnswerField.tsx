import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { CodebookCode } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { buildCodeValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type ScaleVariable = Extract<QuestionVariable, { type: "scale" }>;

interface ScaleItemState {
  item: string;
  label: string;
}

function getScaleItems(variable: ScaleVariable): ScaleItemState[] {
  if (!variable.items?.length) {
    return [{ item: "__default", label: variable.question }];
  }

  return variable.items.map((item) => ({ item: item.name, label: item.label ?? item.name }));
}

function getScaleConditionValue(selectedCodes: Record<string, CodebookCode>, hasItems: boolean): string | Record<string, string> {
  if (!hasItems) {
    return Object.values(selectedCodes)[0]?.code ?? "";
  }

  return Object.fromEntries(Object.entries(selectedCodes).map(([item, code]) => [item, code.code]));
}

function getButtonStyle(code: CodebookCode, selected: boolean): CSSProperties | undefined {
  if (!code.color) return undefined;
  return selected
    ? { backgroundColor: code.color, borderColor: code.color, color: "#111827" }
    : { borderColor: code.color, color: code.color };
}

export function ScaleAnswerField({ variable, onAnswer }: AnswerFieldProps<ScaleVariable>) {
  const scaleItems = useMemo(() => getScaleItems(variable), [variable]);
  const [selectedCodes, setSelectedCodes] = useState<Record<string, CodebookCode>>({});

  // See SelectCodeAnswerField's equivalent comment: no reset-on-`variable`-
  // change effect needed since JobRunner keys `Question` by item.name.

  const hasItems = Boolean(variable.items?.length);
  const isComplete = scaleItems.every((item) => selectedCodes[item.item]);

  function selectCode(itemName: string, code: CodebookCode) {
    if (!hasItems) {
      onAnswer(buildCodeValue([{ code: code.code, value: code.value }]), code.code);
      return;
    }

    setSelectedCodes((current) => ({ ...current, [itemName]: code }));
  }

  function submitItemScale() {
    if (!isComplete) return;

    onAnswer(
      buildCodeValue(
        scaleItems.map((item) => ({
          item: item.item,
          code: selectedCodes[item.item].code,
          value: selectedCodes[item.item].value,
        })),
      ),
      getScaleConditionValue(selectedCodes, hasItems),
    );
  }

  const singleSelection = selectedCodes[scaleItems[0]?.item ?? "__default"];
  const singleIndex = singleSelection ? variable.codes.findIndex((code) => code.code === singleSelection.code) : undefined;

  return (
    <div className="space-y-6">
      {!hasItems && variable.codes.length > 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{variable.codes[0]?.code}</span>
            <span>{variable.codes[variable.codes.length - 1]?.code}</span>
          </div>
          <Slider
            min={0}
            max={variable.codes.length - 1}
            step={1}
            value={singleIndex != null ? [singleIndex] : undefined}
            onValueChange={(value: number[]) => {
              const nextCode = variable.codes[value[0]];
              if (nextCode) setSelectedCodes({ __default: nextCode });
            }}
            onValueCommit={(value: number[]) => {
              const nextCode = variable.codes[value[0]];
              if (nextCode) onAnswer(buildCodeValue([{ code: nextCode.code, value: nextCode.value }]), nextCode.code);
            }}
          />
        </div>
      )}

      <div className="space-y-4">
        {scaleItems.map((item) => {
          const current = selectedCodes[item.item];
          return (
            <div key={item.item} className="space-y-3">
              {hasItems && <p className="text-sm font-medium text-foreground">{item.label}</p>}
              <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(80px,1fr))]">
                {variable.codes.map((code) => {
                  const selected = current?.code === code.code;
                  return (
                    <Button
                      key={`${item.item}-${code.code}`}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      className="h-auto min-h-14 flex-col gap-1 whitespace-normal px-2 py-3"
                      style={getButtonStyle(code, selected)}
                      onClick={() => selectCode(item.item, code)}
                    >
                      <span className="text-base font-semibold">{code.value ?? code.code}</span>
                      <span className="text-xs opacity-80">{code.code}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasItems && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {isComplete ? "All scale items answered." : `Answer ${scaleItems.length - Object.keys(selectedCodes).length} more item(s) to continue.`}
          </p>
          <Button type="button" size="lg" disabled={!isComplete} onClick={submitItemScale}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
