import { Input } from "@/components/ui/input";
import { HelpButton } from "../../../help/HelpButton";
import { ToggleChip } from "./ToggleChip";

/**
 * What a span question selects in: the names the loop's layout shows as
 * selectable text, to switch on and off (each span records its name).
 * Without the layout's names (outside a loop): names separated by commas.
 */
export function SpanFieldsPicker({
  value,
  layoutFields,
  onChange,
}: {
  value: string[];
  layoutFields?: string[];
  onChange: (fields: string[]) => void;
}) {
  const toggle = (field: string) =>
    onChange(value.includes(field) ? value.filter((f) => f !== field) : [...value, field]);
  // The layout's selectable ids are `unit.<field>`; a span question names the unit field.
  const shownFields = layoutFields?.map((id) => id.replace(/^unit\./, ""));
  const names = [...new Set([...(shownFields ?? []), ...value])];
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <label className="text-sm font-medium">Select in</label>
        <HelpButton topic="span" label="Help: selecting text" />
      </span>
      {shownFields ? (
        names.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            The layout has nothing to select in yet: show a unit field as plain text, $unit.&lt;field&gt;.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {names.map((name) => {
              const shown = shownFields.includes(name);
              return (
                <ToggleChip
                  key={name}
                  on={value.includes(name)}
                  missing={!shown}
                  title={shown ? undefined : "The layout doesn't show this as plain text"}
                  onClick={() => toggle(name)}
                >
                  {name}
                </ToggleChip>
              );
            })}
          </div>
        )
      ) : (
        <Input
          value={value.join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((f) => f.trim())
                .filter(Boolean),
            )
          }
          placeholder="headline, text"
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Spans record where they are, so one question can annotate e.g. the headline and the text.
      </p>
    </div>
  );
}
