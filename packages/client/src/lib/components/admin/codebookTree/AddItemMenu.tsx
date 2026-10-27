import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, CornerDownRight, Plus, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { TreePosition } from "../../../codebook/codebookEdit";
import { ActionButton } from "./TreeRow";
import { ITEM_TYPES } from "./itemTypes";
import type { ItemType } from "./utils";

/** A place a new item can go, with the item types allowed there. */
export interface AddOption {
  position: TreePosition;
  /** E.g. "After topic", "Inside Unit loop 1". */
  label: string;
  types: ItemType[];
}

interface AddItemMenuProps {
  options: AddOption[];
  onAdd: (position: TreePosition, type: ItemType) => void;
  /** The position the menu points at (hovered or chosen), to show where the item goes; null when closed. */
  onPreview?: (position: TreePosition | null) => void;
  /** Render as a "+ label" button instead of an icon in the row's action column. */
  label?: string;
  /** Tooltip of the icon button. */
  title?: string;
  /** The icon button's icon (default +). */
  icon?: LucideIcon;
  /**
   * Instead of adding: pick a position (moving items). With one option the
   * button picks it right away; with more, the menu asks where.
   */
  onPick?: (position: TreePosition) => void;
  className?: string;
}

/**
 * A "+" button that opens a menu for the new item: where it goes (only
 * when there is more than one place: the last item of a loop can add
 * inside or after the loop), then its type. With `onPick` the same button
 * picks a place to move items to.
 */
export function AddItemMenu({
  options,
  onAdd,
  onPreview,
  label,
  title = "Add an item below",
  icon = Plus,
  onPick,
  className,
}: AddItemMenuProps) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [triggerHovered, setTriggerHovered] = useState(false);
  // Near the bottom of the (scrolling) tree the menu opens upwards, so it isn't cut off.
  const [upwards, setUpwards] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const single = options.length === 1;
  const current = single ? 0 : chosen;
  const pointed = hovered ?? current;
  // Open: the place pointed at; a single place also while hovering the button.
  const previewed =
    open && pointed !== null ? options[pointed]?.position : single && triggerHovered ? options[0].position : null;
  useEffect(() => {
    onPreview?.(previewed ?? null);
    // Positions are new objects every render: compare by which option is pointed at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pointed, triggerHovered]);

  function close() {
    setOpen(false);
    setChosen(null);
    setHovered(null);
  }
  useCloseOnOutsideClick(containerRef, open, close);

  if (options.length === 0) return null;
  const option = current === null ? null : options[current];

  function toggle() {
    if (open) return close();
    if (onPick && single) {
      setTriggerHovered(false);
      return onPick(options[0].position);
    }
    const button = containerRef.current?.getBoundingClientRect();
    const scroller = containerRef.current?.closest(".overflow-y-auto")?.getBoundingClientRect();
    const bottom = Math.min(scroller?.bottom ?? window.innerHeight, window.innerHeight);
    setUpwards(button !== undefined && bottom - button.bottom < 220 && button.top - (scroller?.top ?? 0) > 220);
    setOpen(true);
  }

  return (
    <div ref={containerRef} className="relative">
      {label === undefined ? (
        <ActionButton
          icon={icon}
          title={single && onPick ? options[0].label : title}
          className={className}
          onClick={toggle}
          onMouseEnter={() => setTriggerHovered(true)}
          onMouseLeave={() => setTriggerHovered(false)}
        />
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="flex cursor-pointer items-center gap-1.5 rounded px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> {label}
        </button>
      )}
      {open && (
        <div
          className={cn(
            "absolute z-50 min-w-56 max-w-80 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95",
            label === undefined ? "right-0" : "left-0",
            upwards ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {option === null ? (
            <>
              <MenuHeader>Where?</MenuHeader>
              {options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (!onPick) return setChosen(i);
                    close();
                    onPick(o.position);
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-muted"
                >
                  <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-primary" style={{ marginLeft: `${i * 6}px` }} />
                  <span className="truncate">{o.label}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                {!single && (
                  <button
                    type="button"
                    title="Back"
                    onClick={() => setChosen(null)}
                    className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <MenuHeader>{option.label}</MenuHeader>
              </div>
              {option.types.map((type) => (
                <TypeOption
                  key={type}
                  type={type}
                  onClick={() => {
                    close();
                    onAdd(option.position, type);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuHeader({ children }: { children: string }) {
  return (
    <div className="truncate px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function TypeOption({ type, onClick }: { type: ItemType; onClick: () => void }) {
  const { label, description, icon: Icon } = ITEM_TYPES[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div>
        <div className="font-semibold text-foreground">{label}</div>
        <div className="text-[10px] font-normal text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

function useCloseOnOutsideClick(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, enabled, onClose]);
}
