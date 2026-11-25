import { X } from "lucide-react";
import { SPECIAL_NAMES, type SpecialAnswer, type SpecialKind } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { specialBadge } from "../../../keyboard/commands";
import { RowButton } from "../optionsEditor/RowButton";
import { patchSpecial, withSpecials } from "./specialAnswers";

/**
 * The added special answers, as rows of the grid of options (or of its own
 * grid): the key of each for coders, its label, its code (`text`: nominal
 * questions, whose codes are text) and a remove button. Without a code the
 * answer is missing.
 */
export function SpecialAnswerRows({
  specials,
  onChange,
  text = false,
}: {
  specials: SpecialAnswer[];
  onChange: (specials: SpecialAnswer[] | undefined) => void;
  text?: boolean;
}) {
  if (!specials.length) return null;
  const update = (kind: SpecialKind, patch: Partial<SpecialAnswer>) =>
    onChange(withSpecials(patchSpecial(specials, kind, patch)));
  return (
    <>
      <span className="col-span-full border-t border-dashed border-border" />
      {specials.map(({ kind, label, value }) => (
        <div key={kind} className="contents">
          <kbd
            className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground"
            title="Its key for coders: / then 8 or 9"
          >
            {specialBadge(kind)}
          </kbd>
          <Input
            aria-label={`Label of ${SPECIAL_NAMES[kind]}`}
            placeholder={SPECIAL_NAMES[kind]}
            value={label ?? ""}
            onChange={(e) => update(kind, { label: e.target.value || undefined })}
            className="h-8 bg-muted/30 text-xs"
          />
          <Input
            aria-label={`Code of ${SPECIAL_NAMES[kind]}`}
            placeholder="no code"
            type={text ? "text" : "number"}
            value={value === undefined ? "" : String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              update(kind, { value: raw === "" ? undefined : text ? raw : Number(raw) });
            }}
            className="h-8 bg-muted/30 font-mono text-xs"
          />
          <span />
          <RowButton
            icon={X}
            label={`Remove ${SPECIAL_NAMES[kind]}`}
            onClick={() => onChange(withSpecials(specials.filter((s) => s.kind !== kind)))}
          />
        </div>
      ))}
    </>
  );
}
