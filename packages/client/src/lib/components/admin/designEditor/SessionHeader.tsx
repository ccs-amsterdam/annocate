import { Link2, Settings2 } from "lucide-react";
import { sessionItem, type SessionItem } from "@annotinder/contracts";
import { cn } from "cn";
import { InfoTip } from "@/components/ui/info-tip";
import { getItemKey } from "../designTree/utils";
import type { DesignDraft } from "./useDesignDraft";

/**
 * Above the item tree: what the study is, rather than an item in it. The
 * public title (what coders see as the study's name), edited in place, and
 * the session parameters (link and URL parameters), one chip each; they
 * open the session form. The design keeps both apart from its items
 * (`session`, `public`); the editor holds them as the Study entry
 * (contracts `designItems`), which the tree doesn't show.
 */
export function SessionHeader({ draft, readOnly }: { draft: DesignDraft; readOnly: boolean }) {
  const session = sessionItem(draft.items) as (SessionItem & { _key?: string }) | null;
  if (!session) return null;
  const key = getItemKey(session as never);
  const open = () => draft.select(key);
  const selected = draft.selected === key;
  const issues = draft.validationErrors.filter((i) => i.path[0] === 0).length;

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/60 px-2 pb-2">
      <div className="flex items-center gap-1">
        <input
          aria-label="Title shown to coders"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-heading text-base font-semibold placeholder:font-normal placeholder:text-muted-foreground/70 hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-ring disabled:hover:border-transparent"
          placeholder="Title shown to coders…"
          maxLength={200}
          disabled={readOnly}
          value={session.public?.title ?? ""}
          onChange={(e) => {
            const next: SessionItem = { ...session, public: { ...session.public, title: e.target.value } };
            if (!e.target.value) delete next.public;
            draft.update(key, next);
          }}
        />
        <InfoTip label="About the title">
          What coders see as the study&apos;s name: on their list of studies and while coding. The study&apos;s own name stays private, so
          it can say what the study is about.
        </InfoTip>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-1">
        <button
          type="button"
          onClick={open}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            selected && "bg-wood/15 text-foreground",
          )}
          title="Values a session starts with, from its link or URL: open to edit"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Session parameters
          {issues > 0 && <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-label="Has problems" />}
        </button>
        {session.params.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={open}
            className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] hover:border-wood/50"
            title={p.kind === "link" ? "A link parameter: each value gets its own link" : "A URL parameter: added to a link by whoever shares it"}
          >
            {p.kind === "link" && <Link2 className="h-3 w-3 text-muted-foreground" />}
            {p.name}
            <span className="text-muted-foreground">{p.kind === "link" ? "link" : "URL"}</span>
          </button>
        ))}
        {session.params.length === 0 && !readOnly && (
          <button
            type="button"
            onClick={open}
            className="inline-flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Add sessions parameters
          </button>
        )}
      </div>
    </div>
  );
}
