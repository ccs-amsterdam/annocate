import type { Display } from "@annotinder/contracts";
import { HelpButton } from "../../../help/HelpButton";
import { withOptional } from "../../../design/itemSettings";

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
  const set = <K extends keyof Display>(key: K, value: Display[K] | undefined) =>
    onChange(withOptional(display, key, value));
  const responsive = display.layouts === "responsive";
  return (
    <section className="flex flex-col gap-4">
      <label className={labelClass}>
        <span className="flex items-center gap-1.5">
          Question auto-layout behavior
          <HelpButton topic="answer-layouts#fixed-or-responsive" label="Help: fixed or responsive layouts" />
        </span>
        <select
          className={selectClass}
          value={display.layouts ?? "fixed"}
          onChange={(e) => set("layouts", e.target.value === "responsive" ? "responsive" : undefined)}
        >
          <option value="fixed">Fixed: every coder sees the same layout</option>
          <option value="responsive">Responsive: adjust to coder device and settings</option>
        </select>
        <span className="text-[11px] font-normal text-muted-foreground">
          {responsive
            ? "Adjust layout to coder's device. Can enhance readability and enables the 'numpad' keyboard shortcut setting"
            : "Keep the answer layout the same across coders. Good for consistency, but can harm readability and customization"}
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
      <fieldset className="flex flex-col gap-1 text-xs">
        <legend className="mb-1 text-xs font-semibold">Coders can enable keyboard shortcuts</legend>
        {(
          [
            ["coderQuestions", "On questions about the coder"],
            ["unitQuestions", "On questions about units"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={display.answerKeys?.[key] !== false}
              onChange={(e) => {
                const next = withOptional(display.answerKeys ?? {}, key, e.target.checked ? undefined : false);
                set("answerKeys", Object.keys(next).length > 0 ? next : undefined);
              }}
            />
            {label}
          </label>
        ))}
        <span className="text-[11px] font-normal text-muted-foreground">
          keyboard shortcuts are optional, and turned off by default. They are mainly usefull for experienced coders.
          You can turn them off if you think it can harm or bias annotations.
        </span>
      </fieldset>
    </section>
  );
}
