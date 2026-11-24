import { Globe, Link2, Monitor, Users, type LucideIcon } from "lucide-react";
import { inviteOf, sessionItem, type SessionItem } from "@annotinder/contracts";
import { cn } from "cn";
import { InfoTip } from "@/components/ui/info-tip";
import { getItemKey } from "../designTree/utils";
import type { DesignDraft } from "./useDesignDraft";
import { useSessionTab, type SessionTab } from "../session/sessionTab";
import { inviteSummary } from "../session/inviteSummary";

/**
 * Above the item tree: what the study is, rather than an item in it. The
 * public title (what coders see as the study's name), edited in place, and
 * the parts of the session, each a button that opens it: the coder
 * invitations, the URL parameters and the display. The design keeps these
 * apart from its items (`session`, `public`); the editor holds them as the
 * Study entry (contracts `designItems`), which the tree doesn't show.
 */
export function SessionHeader({ draft, readOnly }: { draft: DesignDraft; readOnly: boolean }) {
  const [tab, setTab] = useSessionTab();
  const session = sessionItem(draft.items) as (SessionItem & { _key?: string }) | null;
  if (!session) return null;
  const key = getItemKey(session as never);
  const open = (part: SessionTab) => {
    setTab(part);
    draft.select(key);
  };
  const selected = draft.selected === key;
  const issuesOf = (part: string) => draft.validationErrors.filter((i) => i.path[0] === 0 && i.path[1] === part).length;
  const invite = inviteOf(session);
  const params = session.urlParams ?? [];

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/60 px-2 pb-2">
      <div className="flex items-center gap-1">
        <input
          aria-label="Title shown to coders"
          className="font-heading min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-base font-semibold placeholder:font-normal placeholder:text-muted-foreground/70 hover:border-input focus:border-input focus:ring-1 focus:ring-ring focus:outline-none disabled:hover:border-transparent"
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
          What coders see as the study&apos;s name: on their list of studies and while coding. The study&apos;s own name
          stays private, so it can say what the study is about.
        </InfoTip>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-1">
        <HeaderButton
          icon={invite?.mode === "coders" ? Users : Globe}
          label="Who codes"
          summary={inviteSummary(invite)}
          selected={selected && tab === "invite"}
          // Not chosen: needed to deploy
          issues={issuesOf("invite") + (invite ? 0 : 1)}
          title="Who codes, and how they get in. Open to edit"
          onClick={() => open("invite")}
        />
        <HeaderButton
          icon={Link2}
          label="URL parameters"
          summary={params.length === 0 ? "none" : params.map((p) => p.name).join(", ")}
          selected={selected && tab === "urlParams"}
          issues={issuesOf("urlParams")}
          title="Values a link carries, e.g. from a panel. Open to edit"
          onClick={() => open("urlParams")}
        />
        <HeaderButton
          icon={Monitor}
          label="Display"
          summary={[
            session.display?.layouts === "responsive" ? "responsive" : "fixed layouts",
            ...(session.display?.theme && session.display.theme !== "coder" ? [`always ${session.display.theme}`] : []),
          ].join(", ")}
          selected={selected && tab === "display"}
          issues={issuesOf("display")}
          title="How the coding screen looks: layouts and theme. Open to edit"
          onClick={() => open("display")}
        />
      </div>
    </div>
  );
}

/** A part of the session: its name and a summary; opens its form. */
function HeaderButton({
  icon: Icon,
  label,
  summary,
  selected,
  issues,
  title,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  summary: string;
  selected: boolean;
  issues: number;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-wood/50 hover:text-foreground",
        selected && "bg-wood/15 text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0">{label}</span>
      <span className="truncate font-normal text-muted-foreground">· {summary}</span>
      {issues > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-label="Has problems" />}
    </button>
  );
}
