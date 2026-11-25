import { CODER_SET, inviteOf, urlParamKey, type SessionItem } from "@annotinder/contracts";
import { columnValues } from "../../../design/assignment";

/**
 * Who the preview runs as (the server's preview session values): with
 * expert coders, one of them (else the first); a URL parameter with a
 * list of values, one of them (else its default, or the first).
 */
export function PreviewAs({
  session,
  groups,
  value,
  onChange,
}: {
  session: SessionItem | null;
  groups: Parameters<typeof columnValues>[0];
  value: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const invite = inviteOf(session);
  const coders = invite.mode === "coders" ? columnValues(groups, CODER_SET) : [];
  const params = (session?.urlParams ?? []).filter((p) => p.values && p.values.length > 1);
  if (coders.length < 2 && params.length === 0) return null;
  const select = "h-8 rounded-md border border-input bg-background px-2 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-muted-foreground">Preview as</span>
      {coders.length > 1 && (
        <select
          aria-label="Preview as coder"
          className={select}
          value={value.coder ?? coders[0]}
          onChange={(e) => onChange("coder", e.target.value)}
        >
          {coders.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {params.map((p) => (
        <select
          key={p.name}
          aria-label={`Preview with ${p.name}`}
          className={select}
          value={value[urlParamKey(p)] ?? p.default ?? p.values![0].value}
          onChange={(e) => onChange(urlParamKey(p), e.target.value)}
        >
          {p.values!.map((v) => (
            <option key={v.value} value={v.value}>
              {p.name}: {v.label ?? v.value}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
