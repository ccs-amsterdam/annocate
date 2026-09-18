import { useMemo, useState } from "react";
import type { CodebookCode } from "@annotinder/contracts";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildCodeValue } from "./answerValue";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type SearchCodeVariable = Extract<QuestionVariable, { type: "search_code" }>;

function getConditionValue(selectedCodes: CodebookCode[], multiple: boolean): string | string[] {
  const codes = selectedCodes.map((code) => code.code);
  return multiple ? codes : codes[0] ?? "";
}

export function SearchCodeAnswerField({ variable, onAnswer }: AnswerFieldProps<SearchCodeVariable>) {
  const multiple = Boolean(variable.multiple);
  const [open, setOpen] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<CodebookCode[]>([]);
  const selectedCodeNames = useMemo(() => new Set(selectedCodes.map((code) => code.code)), [selectedCodes]);

  // See SelectCodeAnswerField's equivalent comment: no reset-on-`variable`-
  // change effect needed since JobRunner keys `Question` by item.name.

  function handleSelect(code: CodebookCode) {
    if (!multiple) {
      setOpen(false);
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
    setOpen(false);
    onAnswer(
      buildCodeValue(selectedCodes.map((code) => ({ code: code.code, value: code.value }))),
      getConditionValue(selectedCodes, multiple),
    );
  }

  return (
    <div className="space-y-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
            <span className="truncate">
              {selectedCodes.length
                ? selectedCodes.map((code) => code.code).join(", ")
                : "Search and choose a code"}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(32rem,calc(100vw-3rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Type to filter codes..." />
            <CommandList>
              <CommandEmpty>No matching codes.</CommandEmpty>
              <CommandGroup>
                {variable.codes.map((code) => {
                  const selected = selectedCodeNames.has(code.code);
                  return (
                    <CommandItem key={code.code} value={`${code.code} ${code.value ?? ""}`.trim()} onSelect={() => handleSelect(code)}>
                      <span className="flex flex-1 items-center gap-2 truncate">
                        {code.color && <span className="size-3 rounded-full border" style={{ backgroundColor: code.color }} />}
                        <span className="truncate">{code.code}</span>
                      </span>
                      {code.value != null && <span className="text-xs text-muted-foreground">{code.value}</span>}
                      {selected && <Check className="size-4" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {multiple && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {selectedCodes.map((code) => (
              <Button
                key={code.code}
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => handleSelect(code)}
              >
                {code.code}
                <X className="size-3.5" />
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selectedCodes.length ? `${selectedCodes.length} code${selectedCodes.length === 1 ? "" : "s"} selected` : "Select one or more codes."}
            </p>
            <Button type="button" size="lg" disabled={!selectedCodes.length} onClick={handleSubmitSelection}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
