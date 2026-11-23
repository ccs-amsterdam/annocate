import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/**
 * A row's column at one level of the tree (index.css `.tree-rail-*`): the
 * main line on the left, a branch's line one column in. `none`: no line
 * (below the last twig of a level).
 */
export type Rail = "pass" | "tee" | "end" | "root" | "node" | "none";

/** The lines of a row, a column per level; `knot` sits on the last column's line. */
export function Rails({ rails, knot }: { rails: Rail[]; knot?: ReactNode }) {
  return rails.map((rail, i) => (
    <span key={i} aria-hidden className={`tree-rail tree-rail-${rail}`}>
      {i === rails.length - 1 && knot}
    </span>
  ));
}

/** A knot on the line: a small box with an icon (a loop's, a layout's, the start's). */
export function Knot({
  icon: Icon,
  className,
  iconClass,
}: {
  icon: LucideIcon;
  className?: string;
  iconClass?: string;
}) {
  return (
    <span className={cn("tree-knot h-[18px] w-[18px]", className)}>
      <Icon className={cn("h-[11px] w-[11px]", iconClass)} strokeWidth={2.6} />
    </span>
  );
}

interface TreeRowProps {
  /** The lines on the left, a column per level. */
  rails?: Rail[];
  knot?: ReactNode;
  /** Left-hand content (label, "Move here" button, ...). */
  children?: ReactNode;
  /** Right-hand action buttons. */
  actions?: ReactNode;
  /** When true, actions are dimmed until the row is hovered. */
  dimActions?: boolean;
  className?: string;
}

/**
 * Layout primitive shared by every row in the tree, so all rows have the
 * same height and action column, and the lines of rows above and below
 * meet. Rows never change size, so nothing shifts on hover or when
 * entering move mode.
 */
export function TreeRow({ rails = [], knot, children, actions, dimActions = false, className }: TreeRowProps) {
  return (
    <div className={cn("group relative flex h-8 items-center rounded px-2 text-sm transition-colors", className)}>
      <Rails rails={rails} knot={knot} />
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
      {actions && (
        <div
          className={cn(
            "ml-1 flex shrink-0 items-center gap-0.5 transition-opacity",
            dimActions && "opacity-30 group-hover:opacity-100 focus-within:opacity-100 has-[[data-open]]:opacity-100",
          )}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** A line marking where something will be inserted: on the top edge of its (relative) parent. */
export function InsertionLine() {
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
