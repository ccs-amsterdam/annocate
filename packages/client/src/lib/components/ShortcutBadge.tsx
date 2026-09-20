import { useCoderSettings } from "../context/CoderSettingsContext";

export interface ShortcutBadgeProps {
  shortcut: string;
  position?: "top-right" | "top-left" | "right";
  className?: string;
}

/**
 * Standardized absolute keyboard shortcut badge fixed to the edge of a button or icon.
 * Controlled by the coder setting `showShortcuts` (hides when disabled).
 */
export function ShortcutBadge({ shortcut, position = "top-right", className = "" }: ShortcutBadgeProps) {
  const { showShortcuts } = useCoderSettings();
  if (!showShortcuts) return null;

  const posClass =
    position === "top-right"
      ? "-top-1.5 -right-1.5"
      : position === "top-left"
        ? "-top-1.5 -left-1.5"
        : "right-1.5 top-1/2 -translate-y-1/2";

  return (
    <kbd
      className={`absolute ${posClass} z-20 pointer-events-none inline-flex h-4 min-w-[1rem] items-center justify-center rounded border border-border/80 bg-background/95 px-1 font-mono text-[9px] font-semibold text-foreground shadow-xs select-none leading-none ${className}`}
    >
      {shortcut}
    </kbd>
  );
}
