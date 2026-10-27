import { CircleHelp } from "lucide-react";
import { cn } from "cn";
import { openHelp } from "./helpStore";

/**
 * Opens the help on a topic (`topic` or `topic#heading`, a file in
 * ./topics). An icon, or with `children` a small text link.
 */
export function HelpButton({ topic, label = "Help", className, children }: { topic: string; label?: string; className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => openHelp(topic)}
      title={children ? undefined : label}
      aria-label={children ? undefined : label}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-primary",
        children ? "text-xs" : "rounded-full",
        className,
      )}
    >
      <CircleHelp className="h-3.5 w-3.5 shrink-0" />
      {children}
    </button>
  );
}
