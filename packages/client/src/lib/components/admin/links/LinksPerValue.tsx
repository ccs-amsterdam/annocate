import { useState } from "react";
import { urlParamKey, type SessionItem, type UrlParam } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { useCopied } from "./useCopied";

/**
 * URL parameters with known values (a list): a link per
 * value, built here from the links (nothing is stored), e.g. to hand each
 * school or panel its own (docs/architecture.md §7). Other URL
 * parameters keep their placeholders.
 */
export function LinksPerValue({
  session,
  links,
}: {
  session: SessionItem | null;
  links: { label: string; link: string }[];
}) {
  const [param, setParam] = useState<string | null>(null);
  const { copied, copy } = useCopied();
  const params = (session?.urlParams ?? []).filter((p) => p.values !== undefined);
  if (params.length === 0) return null;
  const valuesOf = (p: UrlParam): string[] => (p.values ?? []).map((v) => String(v.value));
  const chosen = params.find((p) => p.name === param) ?? null;
  const rows = chosen
    ? links.flatMap(({ label, link }) =>
        valuesOf(chosen).map((value) => {
          const key = urlParamKey(chosen);
          const placeholder = `${key}=<${chosen.name}>`;
          const filled = `${key}=${encodeURIComponent(value)}`;
          return {
            label,
            value,
            link: link.includes(placeholder)
              ? link.replace(placeholder, filled)
              : `${link}${link.includes("?") ? "&" : "?"}${filled}`,
          };
        }),
      )
    : [];
  const text = rows.map((r) => [r.label, r.value, r.link].join("\t")).join("\n");
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">A link per value of a URL parameter</h3>
      <p className="text-xs text-muted-foreground">
        For a URL parameter with known values, list a link per value, e.g. one per school to send around. Nothing is
        stored: these are the links above with the value filled in.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {params.map((p) => (
          <Button
            key={p.name}
            type="button"
            size="sm"
            variant={param === p.name ? "default" : "outline"}
            onClick={() => setParam(param === p.name ? null : p.name)}
          >
            {p.name}
          </Button>
        ))}
        {rows.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => copy(text)}>
            {copied ? "Copied" : `Copy all ${rows.length} (tab separated)`}
          </Button>
        )}
      </div>
      {rows.length > 0 && (
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.link} className="border-t border-border">
                {links.length > 1 && <td className="py-1 pr-2">{r.label}</td>}
                <td className="py-1 pr-2 font-mono">{r.value}</td>
                <td className="py-1 font-mono break-all text-muted-foreground">{r.link}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
