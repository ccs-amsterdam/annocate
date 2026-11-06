import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * A button that is only an icon: its label is its accessible name and its
 * tooltip. For actions whose icon is clear; keep a text button otherwise.
 */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<typeof Button>, "children"> & { icon: LucideIcon; label: string; iconClassName?: string }
>(function IconButton({ icon: Icon, label, iconClassName, className, variant = "ghost", size = "sm", ...props }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} variant={variant} size={size} aria-label={label} className={cn("h-8 w-8 p-0", className)} {...props}>
          <Icon className={cn("h-4 w-4", iconClassName)} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});
