import { useState } from "react";
import { DEFAULT_REOPEN_MINUTES, MAX_REOPEN_MINUTES } from "@annotinder/contracts";

const UNITS = [
  { label: "minutes", minutes: 1 },
  { label: "hours", minutes: 60 },
  { label: "days", minutes: 24 * 60 },
] as const;

/** The largest unit a number of minutes is a whole number of. */
function unitOf(minutes: number) {
  return [...UNITS].reverse().find((u) => minutes > 0 && minutes % u.minutes === 0) ?? UNITS[0];
}

/**
 * Whether finished sessions stay open (`reopenMinutes` null) or close, and
 * how long coders can go back before they do (contracts `StudyWrite`).
 * Study settings and the first deploy.
 */
export function ReopenSetting({
  value,
  onChange,
  name = "reopen",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  /** The radio group's name: unique on the page. */
  name?: string;
}) {
  // The time shown while sessions stay open: what closing would use
  const [closeAfter, setCloseAfter] = useState(value ?? DEFAULT_REOPEN_MINUTES);
  const [unit, setUnit] = useState(() => unitOf(closeAfter));
  const amount = Math.round(closeAfter / unit.minutes);
  const setMinutes = (minutes: number) => {
    const clamped = Math.max(0, Math.min(MAX_REOPEN_MINUTES, minutes));
    setCloseAfter(clamped);
    onChange(clamped);
  };

  return (
    <fieldset className="flex flex-col gap-2 text-sm text-foreground">
      <legend className="mb-1 text-sm font-medium">When coders finish</legend>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="radio"
          name={name}
          checked={value === null}
          onChange={() => onChange(null)}
          className="mt-1 h-4 w-4 border-input text-primary focus:ring-primary"
        />
        <span>
          Keep their session open
          <span className="block text-xs text-muted-foreground">
            They can always go back to their answers, and pick up units you add later.
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="radio"
          name={name}
          checked={value !== null}
          onChange={() => onChange(closeAfter)}
          className="mt-1 h-4 w-4 border-input text-primary focus:ring-primary"
        />
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5">
            Close it, after
            <input
              type="number"
              aria-label="Time to go back"
              min={0}
              value={amount}
              disabled={value === null}
              onChange={(e) => setMinutes((Number(e.target.value) || 0) * unit.minutes)}
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            />
            <select
              aria-label="Unit of time"
              value={unit.label}
              disabled={value === null}
              onChange={(e) => {
                const next = UNITS.find((u) => u.label === e.target.value) ?? UNITS[0];
                setUnit(next);
                setMinutes(amount * next.minutes);
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              {UNITS.map((u) => (
                <option key={u.label} value={u.label}>
                  {u.label}
                </option>
              ))}
            </select>
          </span>
          <span className="text-xs text-muted-foreground">
            Until then they can go back to fix a mistake, or to code units you add. Then they see only the end screen,
            so their answers stay as they are, also when someone else gets into their device or account.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
