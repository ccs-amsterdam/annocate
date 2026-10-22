import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CodebookCode } from "@annotinder/contracts";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCodeValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { getCodeButtonStyle } from "../../utils/color";
import { useCoderSettings } from "../../context/CoderSettingsContext";

type ScaleVariable = Extract<QuestionVariable, { type: "scale" }>;

/** Key for the single answer of a scale without items. */
const SINGLE = "__single";

interface ScaleItem {
  name: string;
  label: string;
}

function getScaleItems(variable: ScaleVariable): ScaleItem[] {
  if (!variable.items?.length) return [{ name: SINGLE, label: "" }];
  return variable.items.map((item) => ({ name: item.name, label: item.label ?? item.name.replaceAll("_", " ") }));
}

/** Uncoloured codes get a primary-colour gradient from the first to the last point of the scale. */
function gradientStyle(index: number, count: number): CSSProperties {
  const pct = count > 1 ? Math.round(30 + (70 * index) / (count - 1)) : 100;
  return { backgroundColor: `color-mix(in srgb, var(--primary) ${pct}%, transparent)` };
}

/**
 * A row of buttons per item that all show the same scale, so they only show
 * the code's value (or position). The selected button grows to show its code.
 */
export function ScaleAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<ScaleVariable>) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";
  const items = useMemo(() => getScaleItems(variable), [variable]);
  const hasItems = Boolean(variable.items?.length);

  const [selected, setSelected] = useState<Record<string, CodebookCode>>(() => {
    if (!initialValue || !("codes" in initialValue) || !Array.isArray(initialValue.codes)) return {};
    const byCode = new Map(variable.codes.map((c) => [c.code, c]));
    const initial: Record<string, CodebookCode> = {};
    for (const c of initialValue.codes as { code?: string; item?: string }[]) {
      const code = c.code ? byCode.get(c.code) : undefined;
      if (code) initial[hasItems ? (c.item ?? "") : SINGLE] = code;
    }
    return initial;
  });

  const nAnswered = items.filter((item) => selected[item.name]).length;
  const done = nAnswered === items.length;

  function select(itemName: string, code: CodebookCode) {
    if (!hasItems) {
      setSelected({ [SINGLE]: code });
      onAnswer(buildCodeValue([{ code: code.code, value: code.value }]), code.code);
      return;
    }
    setSelected((current) => ({ ...current, [itemName]: code }));
  }

  function submit() {
    if (!done) return;
    onAnswer(
      buildCodeValue(items.map((item) => ({ item: item.name, code: selected[item.name].code, value: selected[item.name].value }))),
      Object.fromEntries(items.map((item) => [item.name, selected[item.name].code])),
    );
  }

  // Number keys answer the first unanswered item; Enter continues once every item is answered.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "Enter" && hasItems && done) {
        event.preventDefault();
        submit();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= Math.min(variable.codes.length, 9)) return;
      const target = items.find((item) => !selected[item.name]) ?? (hasItems ? undefined : items[0]);
      if (!target) return;
      event.preventDefault();
      select(target.name, variable.codes[index]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const first = variable.codes[0];
  const last = variable.codes[variable.codes.length - 1];

  return (
    <div className="flex flex-col gap-2">
      {variable.codes.length > 1 && (
        <div className="flex justify-between gap-4 px-1 text-xs text-muted-foreground">
          <span className="max-w-[40%]">{first.code}</span>
          <span className="max-w-[40%] text-right">{last.code}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const current = selected[item.name];
          return (
            <div key={item.name} className="flex flex-col gap-1">
              {hasItems && <div className="text-center text-sm text-foreground">{item.label}</div>}
              <div className="mx-auto flex w-full max-w-[500px] gap-1.5">
                {variable.codes.map((code, index) => {
                  const isCurrent = current?.code === code.code;
                  const colorStyle = getCodeButtonStyle(code.color, isCurrent, isDark);
                  const style = colorStyle ?? (isCurrent ? undefined : gradientStyle(index, variable.codes.length));
                  return (
                    <button
                      key={code.code}
                      type="button"
                      title={code.code}
                      aria-label={code.code}
                      aria-pressed={isCurrent}
                      onClick={() => select(item.name, code)}
                      style={style}
                      className={`h-8 min-w-0 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-transparent px-1 text-sm font-bold text-foreground transition-all duration-200 ${
                        isCurrent
                          ? `flex-[3_1_auto] px-3 ${colorStyle ? "" : "bg-secondary text-secondary-foreground dark:bg-foreground dark:text-background"} ring-2 ring-primary ring-offset-1 ring-offset-background`
                          : "flex-1 basis-0 hover:brightness-110"
                      }`}
                    >
                      {isCurrent ? code.code : (code.value ?? index + 1)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasItems && (
        <Button type="button" className="mt-1" disabled={!done} onClick={submit}>
          {done ? <Play className="size-4" /> : `${nAnswered} / ${items.length}`}
        </Button>
      )}
    </div>
  );
}
