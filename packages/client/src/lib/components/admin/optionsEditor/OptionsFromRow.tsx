import { ArrowDown, ArrowUp, Database, X } from "lucide-react";
import type { OptionsFrom } from "@annotinder/contracts";
import { RowButton } from "./RowButton";

/** A place options from data can come from: `$unit.<list field>` or `$var.<span question>`. */
export interface OptionSource {
  from: string;
  label: string;
}

/** The options from data, as one fixed row among the options: move it, or remove it. */
export function OptionsFromRow({
  from,
  at,
  count,
  onPlace,
  onRemove,
}: {
  from: OptionsFrom;
  /** Before option `at` (`count`: after the last). */
  at: number;
  /** How many options there are. */
  count: number;
  onPlace: (at: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="contents">
      <span className="flex w-5 justify-center text-muted-foreground">
        <Database className="size-3.5" />
      </span>
      <div
        className="col-span-3 flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 px-2 text-xs text-foreground"
        title="Options from data, made for each unit: they can't be edited here"
      >
        Options from <span className="font-mono">{from.from}</span>
        <span className="text-muted-foreground">
          {from.from.startsWith("$var.") ? "(one per span; the span's id is stored)" : "(the unit's list)"}
        </span>
      </div>
      <span className="flex items-center">
        <RowButton
          icon={ArrowUp}
          label="Move options from data up"
          disabled={at === 0}
          onClick={() => onPlace(at - 1)}
        />
        <RowButton
          icon={ArrowDown}
          label="Move options from data down"
          disabled={at >= count}
          onClick={() => onPlace(at + 1)}
        />
        <RowButton icon={X} label="Remove options from data" onClick={onRemove} />
      </span>
    </div>
  );
}

/** "+ Options from data…": picks where they come from. */
export function OptionsFromSelect({ sources, onPick }: { sources: OptionSource[]; onPick: (from: string) => void }) {
  return (
    <select
      aria-label="Add options from data"
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
    >
      <option value="">+ Options from data…</option>
      {sources.map((s) => (
        <option key={s.from} value={s.from}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
