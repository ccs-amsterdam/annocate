import { useContext, useState } from "react";
import { AnswerKeysContext } from "../../keyboard/context";
import { Check, ChevronDown, Keyboard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import { useCoderSettings } from "../../context/coderSettings";
import { useDisplay } from "../../display/context";
import { LEADER_TIMEOUT } from "../../keyboard/leader";
import { MAPPINGS, mappingById } from "../../keyboard/mappings";
import { useMenuKeys } from "../../keyboard/hooks";

/** The shortcuts every question has, whatever the shortcut style. */
const DEFAULT_SHORTCUTS: [string, string][] = [
  ["← → ↑ ↓", "Move between answer options, or swipe"],
  ["Ctrl + ←  or  / ←  / 4", "Previous question"],
  ["Ctrl + →  or  / →  / 6", "Next question (when possible)"],
  ["Ctrl + Enter  or  / Enter", "Continue / done"],
  ["Ctrl + Space  or  / Space  / 0", "The question's instruction (when it has one)"],
  ["/ 8,  / 9", "Don't know, not applicable (when the question has them)"],
  ["Typing", "Depends on the question: a number, a search"],
];

/**
 * The coder's keyboard settings in the coding screen's top bar (docs/client.md
 * §4 "Keyboard"): the shortcuts every question has, the shortcut style (which
 * keys choose answers), and the shortcut badges on answer options.
 */
export function KeyboardMenu() {
  const { showShortcuts, setShowShortcuts, answerKeys, setAnswerKeys, keyMapping, setKeyMapping } = useCoderSettings();
  // Turned on, but the study turned them off for this question
  const allowedHere = useContext(AnswerKeysContext);
  // The numpad needs layouts that adapt (a responsive study)
  const numpadAllowed = useDisplay().layouts === "responsive";
  const shown = mappingById(keyMapping === "numpad" && !numpadAllowed ? "numbers" : keyMapping);
  const [choosing, setChoosing] = useState(false);
  const [open, setOpen] = useState(false);
  useMenuKeys(open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15"
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-(--radix-popover-content-available-height) w-72 space-y-3 overflow-y-auto p-3 shadow-lg"
        // Closed: the keys go back to the question, not to this button (Space would open it again)
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <h4 className="border-b border-border/80 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Keyboard shortcuts
        </h4>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          {DEFAULT_SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt className="font-mono whitespace-pre text-foreground">{keys}</dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-muted-foreground">
          / is the key that types / on your keyboard, or the one on the numpad. Press it, then the command within{" "}
          {LEADER_TIMEOUT / 1000} seconds.
        </p>

        <Switch id="toggle-answer-keys" label="Answer with keys" on={answerKeys} onChange={setAnswerKeys} />
        {answerKeys && !allowedHere && (
          <p className="text-[11px] text-muted-foreground">This study answers these questions by clicking only.</p>
        )}
        {answerKeys && (
          <div className="space-y-1 border-t border-border/60 pt-2">
            <span id="shortcut-style" className="block text-xs font-medium text-foreground">
              Shortcut style
            </span>
            {/* A list that shows each style's description when open; closed, only the chosen style's name */}
            <Popover open={choosing} onOpenChange={setChoosing}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  id="shortcut-style-value"
                  aria-labelledby="shortcut-style shortcut-style-value"
                  className="flex h-8 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-background px-2 text-xs"
                >
                  {shown.name}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1" role="listbox" aria-label="Shortcut style">
                {MAPPINGS.map((m) => {
                  const disabled = m.id === "numpad" && !numpadAllowed;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={m.id === shown.id}
                      disabled={disabled}
                      onClick={() => {
                        setKeyMapping(m.id);
                        setChoosing(false);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
                        m.id === shown.id && "bg-muted/60",
                      )}
                    >
                      <Check
                        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", m.id === shown.id ? "opacity-100" : "opacity-0")}
                      />
                      <span className="flex flex-col">
                        <span className="text-xs font-medium">{m.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {m.description}
                          {disabled ? " (not in this study)" : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
        )}

        <Switch id="toggle-shortcuts" label="Show shortcut badges" on={showShortcuts} onChange={setShowShortcuts} />
      </PopoverContent>
    </Popover>
  );
}

/** An on / off switch with its label. */
function Switch({
  id,
  label,
  on,
  onChange,
}: {
  id: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border/60 pt-2">
      <label htmlFor={id} className="cursor-pointer text-xs font-medium text-foreground">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
          on ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
