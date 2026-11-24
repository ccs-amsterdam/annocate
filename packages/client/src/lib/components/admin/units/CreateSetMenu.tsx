import { useState, type ReactNode } from "react";
import { ROLE_COLUMNS, TEST_SET, type RoleColumn } from "@annotinder/contracts";
import { ChevronDown, FlaskConical, Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ROLE_LABELS } from "../../../admin/setKinds";

const CREATE_INFO: Record<RoleColumn, string> = {
  coder_set: "Divide the units over named coders (expert coders).",
  condition_set: "Split the units over an experiment's conditions.",
  part_set: "Split the units into parts of the study, e.g. pre and post.",
  test_set: "Draw overlap, practice and gold units at random.",
};

/** "Create special set…": which role column to make (each opens its tooling). */
export function CreateSetMenu({ disabled, onCreate }: { disabled: boolean; onCreate: (column: RoleColumn) => void }) {
  const [open, setOpen] = useState(false);
  const item = (column: RoleColumn, icon: ReactNode) => (
    <button
      key={column}
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onCreate(column);
      }}
      className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-muted"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-foreground">
          {ROLE_LABELS[column]} <span className="font-mono text-xs font-normal text-muted-foreground">{column}</span>
        </span>
        <span className="block text-xs text-muted-foreground">{CREATE_INFO[column]}</span>
      </span>
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled}>
          <Plus className="h-3.5 w-3.5" />
          Create special set…
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5" role="menu">
        {ROLE_COLUMNS.map((c) =>
          item(c, c === TEST_SET ? <FlaskConical className="h-4 w-4" /> : <Tags className="h-4 w-4" />),
        )}
      </PopoverContent>
    </Popover>
  );
}
