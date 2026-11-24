import { SPECIAL_KINDS, SPECIAL_NAMES, type SpecialAnswer, type SpecialKind } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { specialBadge } from "../../../keyboard/commands";

/**
 * A question's special answers (docs/client.md §4): don't know and not
 * applicable, each on or off, with a label and an optional code (`text`:
 * nominal questions, whose codes are text). Without a code the answer is
 * missing. Coders' keys: / 8 don't know, / 9 not applicable.
 */
export function SpecialAnswersFields({
  specials,
  onChange,
  text = false,
}: {
  specials: SpecialAnswer[] | undefined;
  onChange: (specials: SpecialAnswer[] | undefined) => void;
  text?: boolean;
}) {
  const list = specials ?? [];
  const set = (next: SpecialAnswer[]) => onChange(next.length ? next : undefined);
  const update = (kind: SpecialKind, patch: Partial<SpecialAnswer>) =>
    set(
      list.map((s) => {
        if (s.kind !== kind) return s;
        const next = { ...s, ...patch };
        if (next.label === undefined) delete next.label;
        if (next.value === undefined) delete next.value;
        return next;
      }),
    );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">Special answers</span>
        <InfoTip label="About special answers">
          Answers outside the options, shown in a row under them: don&apos;t know and not applicable. The label is
          yours, e.g. &quot;Prefer not to say&quot; or &quot;None of these&quot;. Without a code the answer is stored as
          missing (no value); with one, the code. Coders can choose them with the keys / 8 (don&apos;t know) and / 9
          (not applicable). When coders can pick several options, a special answer is the only answer; on a scale every
          item has them.
        </InfoTip>
      </div>
      <div className="grid grid-cols-[auto_1fr_6rem_auto] items-center gap-1.5">
        {SPECIAL_KINDS.map((kind) => {
          const special = list.find((s) => s.kind === kind);
          return (
            <div key={kind} className="contents">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!special}
                  onChange={(e) => set(e.target.checked ? [...list, { kind }] : list.filter((s) => s.kind !== kind))}
                />
                {SPECIAL_NAMES[kind]}
              </label>
              <Input
                aria-label={`Label of ${SPECIAL_NAMES[kind]}`}
                placeholder={SPECIAL_NAMES[kind]}
                disabled={!special}
                value={special?.label ?? ""}
                onChange={(e) => update(kind, { label: e.target.value || undefined })}
                className="h-8 text-xs"
              />
              <Input
                aria-label={`Code of ${SPECIAL_NAMES[kind]}`}
                placeholder="no code"
                type={text ? "text" : "number"}
                disabled={!special}
                value={special?.value === undefined ? "" : String(special.value)}
                onChange={(e) => {
                  const raw = e.target.value;
                  update(kind, { value: raw === "" ? undefined : text ? raw : Number(raw) });
                }}
                className="h-8 font-mono text-xs"
              />
              <kbd
                className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground"
                title="Its key for coders: / then 8 or 9"
              >
                {specialBadge(kind)}
              </kbd>
            </div>
          );
        })}
      </div>
    </div>
  );
}
