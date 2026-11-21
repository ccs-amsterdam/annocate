import type { Display } from "@annotinder/contracts";
import { HelpButton } from "../../../help/HelpButton";

const labelClass = "flex flex-col gap-1 text-xs font-semibold";
const selectClass = "h-8 w-fit rounded-md border border-input bg-background px-2 text-xs font-normal";

/**
 * How the coding screen looks (the Study entry's `display`, docs/client.md
 * §4 "Display"): whether "auto" layouts are the same for every coder or
 * adapt to the screen and the coder's keys, and the theme.
 */
export function DisplaySettings({
  display = {},
  onChange,
}: {
  display?: Display;
  onChange: (display: Display) => void;
}) {
  const set = <K extends keyof Display>(key: K, value: Display[K] | undefined) => {
    const next = { ...display, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const responsive = display.layouts === "responsive";
  return (
    <section className="flex flex-col gap-4">
      <label className={labelClass}>
        <span className="flex items-center gap-1.5">
          Layouts
          <HelpButton topic="answer-layouts#fixed-or-responsive" label="Help: fixed or responsive layouts" />
        </span>
        <select
          className={selectClass}
          value={display.layouts ?? "fixed"}
          onChange={(e) => set("layouts", e.target.value === "responsive" ? "responsive" : undefined)}
        >
          <option value="fixed">Fixed: every coder sees the same layout</option>
          <option value="responsive">Responsive: adapt to the screen and the coder&apos;s keys</option>
        </select>
        <span className="text-[11px] font-normal text-muted-foreground">
          {responsive
            ? "Questions with an auto layout use more columns on wider screens, and follow the coder's keys: with the numpad, buttons in three columns; typing to filter, buttons instead of a dropdown. Layouts you chose for a question stay as they are. Each coder's display is recorded with their session."
            : "Auto layouts follow the options only, the same on every device, so every coder sees the same question. Coders can't use the numpad keys."}
        </span>
      </label>
      <label className={labelClass}>
        Light or dark
        <select
          className={selectClass}
          value={display.theme ?? "coder"}
          onChange={(e) => set("theme", e.target.value === "coder" ? undefined : (e.target.value as Display["theme"]))}
        >
          <option value="coder">The coder chooses</option>
          <option value="light">Always light</option>
          <option value="dark">Always dark</option>
        </select>
        <span className="text-[11px] font-normal text-muted-foreground">
          Fix it when the units need one background, e.g. images or colours made for light or dark.
        </span>
      </label>
    </section>
  );
}
