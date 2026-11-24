import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Moon, Settings, Sun } from "lucide-react";
import { useCoderSettings } from "../../context/coderSettings";
import { useMenuKeys } from "../../keyboard/hooks";

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

/** The coder's settings in the coding screen's top bar: light or dark (the keyboard's are KeyboardMenu). */
export function CoderSettingsMenu() {
  // A study may show one theme for everyone
  const { theme, setTheme, themeLocked } = useCoderSettings();
  const [open, setOpen] = useState(false);
  useMenuKeys(open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      </PopoverContent>
    </Popover>
  );
}
