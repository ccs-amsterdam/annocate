import { useEffect, useRef, useState, type RefObject } from "react";
import { CircleDashedIcon, CircleQuestionMark, LucideListEnd, Plus } from "lucide-react";
import { cn } from "cn";
import { ActionButton } from "./TreeRow";
import { ITEM_TYPES } from "./itemTypes";
import type { ItemType } from "./utils";

interface AddItemMenuProps {
  /** Used as tooltip and menu header, e.g. "Insert above question_1". */
  title: string;
  allowedTypes: ItemType[];
  onAdd: (type: ItemType) => void;
  /**
   * Called with true while the user is hovering the + button or has the menu
   * open, so the row can preview where the item will be inserted.
   */
  onActiveChange?: (active: boolean) => void;
  /**
   * Render as a small inline "+ label" button (opening its menu to the right)
   * instead of an icon in the row's action column.
   */
  label?: string;
}

/** A "+" button that opens a menu for picking the type of the new item. */
export function AddItemMenu({ title, allowedTypes, onAdd, onActiveChange, label }: AddItemMenuProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = open || hovered;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useCloseOnOutsideClick(containerRef, open, () => setOpen(false));

  function handleSelect(type: ItemType) {
    setOpen(false);
    onAdd(type);
  }

  const triggerProps = {
    title,
    onClick: () => setOpen((o) => !o),
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  return (
    <div ref={containerRef} className={`relative ${label === undefined ? "" : "w-full flex"}`}>
      {label === undefined ? (

        <ActionButton icon={Plus} {...triggerProps} />
      ) : (
        <button
          type="button"
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded leading-4 text-muted-foreground/60 transition-colors hover:text-foreground",
            open && "text-foreground",
          )}
          {...triggerProps}
        >
          <LucideListEnd className="h-4 w-4 m-auto" />
          {label}
        </button>
      )}
      {open && (
        <div
          className={cn(
            "absolute top-full z-50 mt-1 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95",
            label === undefined ? "right-0" : "left-0",
          )}
        >
          <div className="truncate px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </div>
          {allowedTypes.map((type) => (
            <TypeOption key={type} type={type} onClick={() => handleSelect(type)} />
          ))}
        </div>
      )}
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

function useCloseOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onClose: () => void,
) {
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
