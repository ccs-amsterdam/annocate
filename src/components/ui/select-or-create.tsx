// based on https://armand-salle.fr/post/autocomplete-select-shadcn-ui/

import { CommandGroup, CommandItem, CommandList, CommandInput, CommandCreateItem } from "./command";
import { Command as CommandPrimitive } from "cmdk";
import { useState, useRef, useCallback, type KeyboardEvent, useEffect } from "react";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Loading } from "./loader";
import { Button } from "./button";

export type Option = Record<"value" | "label", string> & Record<string, string>;

type AutoCompleteProps<T> = {
  options: T[];
  optionKey: keyof T;
  createMessage: string;
  value?: string;
  onValueChange?: (option: T | undefined, value: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function SelectOrCreate<T>({
  options,
  optionKey,
  placeholder,
  createMessage,
  value,
  onValueChange,
  disabled,
  isLoading = false,
}: AutoCompleteProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setOpen] = useState(false);
  const [selected, setSelected] = useState<T | undefined>();
  const [inputValue, setInputValue] = useState<string>(value || "");

  useEffect(() => {
    // hack to handle the create new option on enter
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      // Keep the options displayed when the user is typing
      if (!isOpen) {
        setOpen(true);
      }

      // This is not a default behaviour of the <input /> field
      if (event.key === "Enter" && input.value !== "") {
        const optionToSelect = options.find((option) => option[optionKey] === input.value);
        if (optionToSelect) {
          setSelected(optionToSelect);
          onValueChange?.(optionToSelect, input.value);
        }
      }

      if (event.key === "Escape") {
        input.blur();
      }
    },
    [isOpen, options, onValueChange, optionKey],
  );

  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     const option = options.find((option) => option[optionKey] === inputValue);
  //     onValueChange?.(option, inputValue);
  //   }, 100);
  // }, [inputValue, options, optionKey, onValueChange]);

  const handleBlur = () => {
    setOpen(false);
    setInputValue(value || "");
  };

  const handleCreate = (value: string) => {
    onValueChange?.(undefined, value);
    setTimeout(() => {
      inputRef?.current?.blur();
    }, 0);
  };

  const handleSelectOption = useCallback(
    (selectedOption: T | undefined, value: string) => {
      setInputValue(value);

      setSelected(selectedOption);
      onValueChange?.(selectedOption, value);

      setTimeout(() => {
        inputRef?.current?.blur();
      }, 0);
    },
    [onValueChange],
  );

  return (
    <CommandPrimitive onKeyDown={handleKeyDown}>
      <div>
        <CommandInput
          ref={inputRef}
          value={inputValue}
          onValueChange={isLoading ? undefined : setInputValue}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="text-base"
        />
      </div>
      <div className="relative mt-1">
        <div
          className={cn(
            "absolute top-0 z-10 w-full rounded-xl bg-background outline-none animate-in fade-in-0 zoom-in-95",
            isOpen ? "block" : "hidden",
          )}
        >
          <CommandList className="rounded-lg ring-1 ring-slate-200">
            {isLoading ? (
              <CommandPrimitive.Loading>
                <div className="p-1">
                  <Loading />
                </div>
              </CommandPrimitive.Loading>
            ) : null}
            <CommandCreateItem onSelect={handleCreate}>{createMessage}</CommandCreateItem>
            {options.length > 0 && !isLoading ? (
              <>
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selected?.[optionKey] === option[optionKey];
                    return (
                      <CommandItem
                        key={String(option[optionKey])}
                        value={String(option[optionKey])}
                        onMouseDown={(event: any) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onSelect={() => handleSelectOption(option, String(option[optionKey]))}
                        className={cn("flex w-full items-center gap-2", !isSelected ? "pl-8" : null)}
                      >
                        {isSelected ? <Check className="w-4" /> : null}
                        {String(option[optionKey])}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </div>
      </div>
    </CommandPrimitive>
  );
}
