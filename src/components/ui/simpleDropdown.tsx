import { ChevronDownIcon } from "lucide-react";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

interface Props<T> {
  options: T[];
  optionKey: keyof T;

  placeholder: string;
  value: string | undefined;
  setValue: (value: string) => void;
}

export function SimpleDropdown<T extends {}>({ options, optionKey, placeholder, value, setValue }: Props<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={!options || options.length === 0} asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-2">
          {value || placeholder}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(options || []).map((option) => {
          const key = String(option[optionKey]);
          return (
            <DropdownMenuItem key={key} onClick={() => setValue(key)}>
              {key}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
