import type { ComponentProps, MouseEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

interface TreeRowProps {
  /** normal = 30px, compact = 20px (used for the end rows of container lists). */
  size?: "normal" | "compact";
  /** Left-hand content (label, "Move here" button, ...). */
  children?: ReactNode;
  /** Right-hand action buttons. */
  actions?: ReactNode;
  /** When true, actions are dimmed until the row is hovered. */
  dimActions?: boolean;
  /** Draws a line on the top edge of the row: "something will be inserted here". */
  showInsertionLine?: boolean;
  className?: string;
  onClick?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Layout primitive shared by every row in the tree (items and list-end rows),
 * so all rows of a size have the same height and action column. Rows never
 * change size, so nothing shifts on hover or when entering move mode.
 */
export function TreeRow({
  size = "normal",
  children,
  actions,
  dimActions = false,
  showInsertionLine = false,
  className,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: TreeRowProps) {
  return (
    <div
      className={cn(
        "group relative flex items-center justify-between gap-2 rounded px-2 text-sm transition-colors",
        size === "compact" ? "h-5" : "h-[30px]",
        className,
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {showInsertionLine && <InsertionLine />}
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
      {actions && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 transition-opacity",
            dimActions && "opacity-30 group-hover:opacity-100",
          )}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

function InsertionLine() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex -translate-y-1/2 items-center">
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <div className="h-[2px] flex-1 bg-primary/30" />
    </div>
  );
}

interface ActionButtonProps extends ComponentProps<"button"> {
  icon: LucideIcon;
  destructive?: boolean;
}

/** Small icon button for the row's action column. */
export function ActionButton({ icon: Icon, destructive = false, className, ...props }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded text-muted-foreground",
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
