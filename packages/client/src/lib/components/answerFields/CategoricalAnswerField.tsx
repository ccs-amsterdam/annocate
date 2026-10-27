import { useCallback, useMemo, useState } from "react";
import { optionLabel, resolveLayout, type Option, type OptionValue } from "@annotinder/contracts";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildValues, initialValues } from "./answerValue";
import { CompactRow, EndLabels, OptionButton, optionsContainerStyle, useNumberShortcuts } from "./OptionButtons";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type CategoricalVariable = Extract<QuestionVariable, { type: "nominal" | "ordinal" }>;

/**
 * Nominal and ordinal questions: pick one (or with `multiple`, several) of the options, laid out as the
 * question says or as `auto` picks (resolveLayout). One answer is given on
 * the first click; several are confirmed with Continue.
 */
export function CategoricalAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<CategoricalVariable>) {
  const multiple = variable.type === "nominal" && Boolean(variable.multiple);
  const resolved = resolveLayout(variable);
  const layout = "columns" in resolved ? resolved.layout : "grid";
  const columns = "columns" in resolved ? resolved.columns : 1;
  const [selected, setSelected] = useState<OptionValue[]>(() => initialValues(initialValue));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const pick = useCallback(
    (option: Option) => {
      if (!multiple) {
        setSelected([option.value]);
        onAnswer(buildValues([{ value: option.value }]));
        return;
      }
      setSelected((current) => (current.includes(option.value) ? current.filter((v) => v !== option.value) : [...current, option.value]));
    },
    [multiple, onAnswer],
  );

  const submit = () => {
    if (!selected.length) return;
    // In option order, not click order.
    const values = variable.options.map((o) => o.value).filter((v) => selectedSet.has(v));
    onAnswer(buildValues(values.map((value) => ({ value }))));
  };

  const onShortcut = useCallback((index: number) => pick(variable.options[index]), [pick, variable.options]);
  useNumberShortcuts(variable.options.length, layout === "dropdown" ? null : onShortcut);

  let field;
  if (layout === "dropdown") {
    field = <OptionsDropdown options={variable.options} selected={selectedSet} multiple={multiple} onPick={pick} />;
  } else if (layout === "compact") {
    field = (
      <div className="flex flex-col gap-1">
        <EndLabels options={variable.options} />
        <CompactRow options={variable.options} selected={selected[0]} onSelect={pick} />
      </div>
    );
  } else {
    const container = optionsContainerStyle(layout, variable.options.length, columns);
    field = (
      <div className={container.className} style={container.style}>
        {variable.options.map((option, index) => (
          <OptionButton
            key={String(option.value)}
            option={option}
            selected={selectedSet.has(option.value)}
            shortcut={index}
            check={multiple}
            onClick={() => pick(option)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {field}
      {multiple && (
        <Button type="button" className="h-10" disabled={!selected.length} onClick={submit}>
          Continue{selected.length ? ` (${selected.length})` : ""}
        </Button>
      )}
    </div>
  );
}

interface OptionsDropdownProps {
  options: Option[];
  selected: Set<OptionValue>;
  multiple: boolean;
  onPick: (option: Option) => void;
}

/** A combobox with a filter box, for long lists. */
function OptionsDropdown({ options, selected, multiple, onPick }: OptionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => selected.has(o.value));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between">
          <span className="truncate">{chosen.length ? chosen.map(optionLabel).join(", ") : "Choose…"}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to filter…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={String(option.value)}
                  value={`${optionLabel(option)} ${option.value}`}
                  onSelect={() => {
                    if (!multiple) setOpen(false);
                    onPick(option);
                  }}
                >
                  <span className="flex flex-1 items-center gap-2 truncate">
                    {option.color && <span className="size-3 rounded-full border" style={{ backgroundColor: option.color }} />}
                    <span className="truncate">{optionLabel(option)}</span>
                  </span>
                  {selected.has(option.value) && <Check className="size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
