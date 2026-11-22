import { InfoTip } from "@/components/ui/info-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Moon, Settings, Sun } from "lucide-react";
import { useCoderSettings } from "../../context/coderSettings";
import { useDisplay } from "../../display/context";
import { MAPPINGS, mappingById } from "../../keyboard/mappings";

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** The coder's settings in the coding screen's top bar: light or dark, shortcut badges, and the keys for answers. */
export function CoderSettingsMenu() {
  const { theme, setTheme, themeLocked, showShortcuts, setShowShortcuts, keyMapping, setKeyMapping } =
    useCoderSettings();
  // The numpad needs layouts that adapt (a responsive study); a study may show one theme for everyone
  const display = useDisplay();
  const numpadAllowed = display.layouts === "responsive";
  const shownMapping = keyMapping === "numpad" && !numpadAllowed ? "numbers" : keyMapping;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15"
          title="Coder Settings"
          aria-label="Coder Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-3 p-3 shadow-lg">
        <div className="border-b border-border/80 pb-2">
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Settings</h4>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Appearance</label>
          {themeLocked && (
            <p className="text-[11px] leading-tight text-muted-foreground">This study is shown {theme} for everyone.</p>
          )}
          <div className={`grid grid-cols-2 gap-1.5 ${themeLocked ? "hidden" : ""}`}>
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  theme === value
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-border bg-muted/40 text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between">
            <label htmlFor="toggle-shortcuts" className="cursor-pointer text-xs font-medium text-foreground">
              Shortcuts
            </label>
            <button
              id="toggle-shortcuts"
              type="button"
              role="switch"
              aria-checked={showShortcuts}
              onClick={() => setShowShortcuts(!showShortcuts)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                showShortcuts ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  showShortcuts ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Show keyboard hotkey badges on answer options
          </p>
          <label htmlFor="key-mapping" className="block pt-1 text-xs font-medium text-foreground">
            Keys for answers
          </label>
          <select
            id="key-mapping"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={shownMapping}
            onChange={(e) => setKeyMapping(e.target.value)}
          >
            {MAPPINGS.map((m) => (
              <option key={m.id} value={m.id} disabled={m.id === "numpad" && !numpadAllowed}>
                {m.name}
                {m.id === "numpad" && !numpadAllowed ? " (not in this study)" : ""}
              </option>
            ))}
          </select>
          {!numpadAllowed && (
            <p className="flex items-start gap-1 text-[11px] leading-tight text-muted-foreground">
              <InfoTip label="Why no numpad?">
                Numpad keys need layouts that adapt to them: buttons in three columns. This study shows every coder the
                same layout (a setting of the study, Display: layouts fixed), so the numpad isn&apos;t available here.
              </InfoTip>
              Numpad: not in this study
            </p>
          )}
          <p className="text-[11px] leading-tight text-muted-foreground">
            {mappingById(shownMapping).description}. Always: arrows and Space, Shift + ← → for previous and next,
            Backspace to go back, 0 not applicable, . don&apos;t know.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
