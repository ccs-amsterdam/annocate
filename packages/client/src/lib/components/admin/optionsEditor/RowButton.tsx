import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A small icon button of a row of options (move up, move down, remove). */
export function RowButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={onClick} aria-label={label}>
      <Icon className="size-3.5" />
    </Button>
  );
}
