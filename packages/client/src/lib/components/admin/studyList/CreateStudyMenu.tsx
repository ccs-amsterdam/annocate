import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileUp, Sparkles, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** "Create new study": an empty study, an example, or a file (a study export or a design file). */
export function CreateStudyMenu({
  onExample,
  onImport,
  onEmpty,
}: {
  onExample: () => void;
  onImport: () => void;
  onEmpty: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = (icon: ReactNode, title: string, text: string, onClick: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-muted"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button className="w-fit gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          Create new study
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5" role="menu">
        {item(<Plus className="h-4 w-4" />, "Empty study", "Start from scratch in the editor.", onEmpty)}
        {item(<Sparkles className="h-4 w-4" />, "From an example", "A ready study to try and change.", onExample)}
        {item(
          <FileUp className="h-4 w-4" />,
          "From a file",
          "A copy of a study from its export, or a study from a design file.",
          onImport,
        )}
      </PopoverContent>
    </Popover>
  );
}
