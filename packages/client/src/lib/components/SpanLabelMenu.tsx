import { useState } from "react";
import { optionLabel, type Option, type SpanSlice } from "@annotinder/contracts";
import { X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useCoderSettings } from "../context/coderSettings";
import { getCodeButtonStyle } from "../utils/color";
import { ShortcutBadge } from "./ShortcutBadge";
import { useTargetKeys } from "../keyboard/hooks";

/**
 * The labels for a new span, right at the selection (when the coding area
 * is at least 42rem wide, as the answer pane's `@2xl`; narrower, as on a
 * phone or in a phone-sized preview, they are in the docked answer pane,
 * near the thumbs). The menu is in a portal, outside the coding area's
 * container, so it measures that area itself.
 * Rendered as a zero-width anchor after the selection's last part. It
 * doesn't take focus or close on clicks elsewhere: coders go on adjusting
 * the selection in the text. Keys (the shortcut style's, Esc) are handled
 * by the answer field, as for the pane's buttons.
 */
export function SpanLabelMenu({
  options,
  slices,
  onLabel,
  onCancel,
}: {
  options: Option[];
  slices: SpanSlice[];
  onLabel: (value: string) => void;
  onCancel: () => void;
}) {
  const { theme } = useCoderSettings();
  const isDark = theme === "dark";
  const keys = useTargetKeys(options.map((o) => ({ label: optionLabel(o) })));
  const [wide, setWide] = useState(false);
  const measure = (anchor: HTMLSpanElement | null) => {
    const area = anchor?.closest<HTMLElement>(".\\@container");
    if (area) setWide(area.clientWidth >= 42 * parseFloat(getComputedStyle(document.documentElement).fontSize));
  };
  if (!wide) return <span ref={measure} aria-hidden className="inline-block w-0" />;
  return (
    <Popover open modal={false}>
      <PopoverAnchor asChild>
        <span ref={measure} aria-hidden className="inline-block h-[1em] w-0 align-text-bottom" />
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        // Keep the selection: a click here mustn't start a new one in the text
        onMouseDown={(e) => e.preventDefault()}
        className="flex w-auto max-w-[min(28rem,calc(100vw-2rem))] flex-col gap-1.5 p-2 shadow-lg"
        aria-label={`Label "${slices.map((s) => s.text).join(" … ")}"`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">Label as</span>
          <button
            type="button"
            onClick={onCancel}
            className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="Cancel selection (Esc)"
            aria-label="Cancel selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option, idx) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onLabel(String(option.value))}
              className="relative flex cursor-pointer items-center justify-center rounded-md border px-2.5 py-1 text-xs font-semibold shadow-xs transition-transform hover:scale-105 active:scale-95"
              style={getCodeButtonStyle(option.color, false, isDark)}
            >
              {keys[idx] && <ShortcutBadge shortcut={keys[idx]!} />}
              <span className="truncate">{optionLabel(option)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
