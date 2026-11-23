import { useState } from "react";
import { Globe, Users } from "lucide-react";
import {
  CODER_SET,
  DEFAULT_INVITE,
  type CrowdInvite,
  type DesignIssue,
  type Invite,
  type SetGroupResponse,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "cn";
import { HelpButton } from "../../../help/HelpButton";
import { coderSummary, columnValues } from "../../../design/assignment";
import { IssueList } from "../IssueList";
import { issuesAt } from "../issues";
import { CoderSetDialog } from "./CoderSetDialog";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs font-normal";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/**
 * Who codes, and how they get in (the Study entry's `invite`,
 * docs/architecture.md §6, docs/plans/unit-sets.md): specific coders (the
 * values of the units' `coder_set`, each with their own units; a link each,
 * one link where they pick their name, or one where they sign in with their
 * email address), or one link (for anyone: a survey, an experiment, or a
 * crowd; an optional coder id from the URL, optional sign-in, a maximum of
 * coders). Whether one link's coders divide the units is each unit loop's.
 */
export function InvitationSettings({
  invite = DEFAULT_INVITE,
  groups,
  issues,
  client,
  onChange,
}: {
  invite?: Invite;
  groups: SetGroupResponse[];
  issues: DesignIssue[];
  /** To make the coder set (absent: read only). */
  client?: ResearcherApi;
  onChange: (invite: Invite) => void;
}) {
  const setMode = (mode: Invite["mode"]) => {
    if (mode === invite.mode) return;
    // Switching back brings back what was set in that mode (in this editing session)
    const memory = rememberedModes(client?.studyId);
    memory[invite.mode] = invite;
    const back = memory[mode];
    if (back) onChange(back);
    else if (mode === "crowd") onChange({ mode: "crowd" });
    else onChange({ mode: "coders", link: "per_coder" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who codes">
        <ModeCard
          active={invite.mode === "coders"}
          icon={Users}
          title="Specific coders"
          text="Coders you know, each with their own units"
          onClick={() => setMode("coders")}
        />
        <ModeCard
          active={invite.mode === "crowd"}
          icon={Globe}
          title="One link"
          text="One link for anyone: a survey, an experiment, or a crowd"
          onClick={() => setMode("crowd")}
        />
      </div>
      {invite.mode === "coders" ? (
        <CodersForm invite={invite} groups={groups} client={client} onChange={onChange} />
      ) : (
        <CrowdForm invite={invite} onChange={onChange} />
      )}
      <IssueList issues={issuesAt(issues, "invite")} />
    </div>
  );
}

function ModeCard({
  active,
  icon: Icon,
  title,
  text,
  onClick,
}: {
  active: boolean;
  icon: typeof Users;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
        {title}
      </span>
      <span className="text-[11px] text-muted-foreground">{text}</span>
    </button>
  );
}

function CodersForm({
  invite,
  groups,
  client,
  onChange,
}: {
  invite: Extract<Invite, { mode: "coders" }>;
  groups: SetGroupResponse[];
  client?: ResearcherApi;
  onChange: (invite: Invite) => void;
}) {
  const [making, setMaking] = useState(false);
  // The coders: the units' coder set
  const known = groups.some((g) => g.name === CODER_SET);
  const coders = coderSummary(columnValues(groups, CODER_SET));
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold">
          Coder set
          <InfoTip label="About the coder set">
            The units&apos; column <span className="font-mono">coder_set</span> says who codes each unit (
            <span className="font-mono">anna</span>, <span className="font-mono">anna;bob</span> for both). Test units
            (<span className="font-mono">test_unit</span>: overlap, practice, gold) go to everyone. Make it here, or on
            the Units page.
          </InfoTip>
        </span>
        {client && (
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setMaking(true)}>
            {known ? "Update coder set…" : "Create coder set…"}
          </Button>
        )}
        <HelpButton topic="sets" label="Help: dividing units" />
      </div>
      {!known ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          A coder set is required: it says who codes which units. Create one here, or on the Units page.
        </p>
      ) : coders.kind === "none" ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">The coder set has no coders yet.</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {coders.count} coder{coders.count === 1 ? "" : "s"}
          {coders.kind === "emails" ? " (email addresses)" : coders.kind === "mixed" ? " (names and emails)" : ""}.
        </p>
      )}
      {/* Disabled until there is a coder set: the links and names come from it */}
      <fieldset className="flex flex-col gap-1 disabled:opacity-50" disabled={!known}>
        <legend className="mb-1 text-xs font-semibold">How coders get in</legend>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={invite.link === "per_coder"}
            onChange={() => onChange({ ...invite, link: "per_coder", nameDevices: undefined })}
          />
          A link per coder (deploying makes them; send each coder theirs)
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={invite.link === "pick_name"}
            onChange={() => onChange({ ...invite, link: "pick_name" })}
          />
          One link: coders pick their name from the coder set
        </label>
        {invite.link === "pick_name" && (
          <div className="flex flex-col gap-1 pl-6">
            <select
              aria-label="A picked name"
              className={cn(selectClass, "w-fit")}
              value={invite.nameDevices ?? "first"}
              onChange={(e) => onChange({ ...invite, nameDevices: e.target.value === "any" ? "any" : undefined })}
            >
              <option value="first">A name stays on the first device that picks it</option>
              <option value="any">Any device that picks a name continues its session</option>
            </select>
            <span className="text-[11px] text-muted-foreground">
              {invite.nameDevices === "any"
                ? "Shared: e.g. a team taking turns on devices, or one coder on several. Anyone with the link can pick any name."
                : "Pinned: once a name is picked, nobody else can pick it; its coder continues on that device (or moves with a transfer link)."}
            </span>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={invite.link === "login"}
            onChange={() => onChange({ ...invite, link: "login", nameDevices: undefined })}
          />
          One link: coders sign in with the email address in the coder set
        </label>
        {invite.link === "login" && known && coders.kind !== "emails" && coders.kind !== "none" && (
          <p className="pl-6 text-[11px] text-destructive">
            Signing in needs email addresses: the coder set has{" "}
            {coders.notEmails.slice(0, 3).join(", ")}
            {coders.notEmails.length > 3 ? ", …" : ""}.
          </p>
        )}
      </fieldset>
      <p className="text-[11px] text-muted-foreground">
        Coders can always sign in to keep their work across devices; with a link each you don&apos;t see their email
        address.
      </p>
      {making && client && (
        <CoderSetDialog
          client={client}
          groups={groups}
          onDone={(result) => {
            setMaking(false);
            if (result) onChange({ ...invite, link: result.emails ? "login" : invite.link });
          }}
        />
      )}
    </section>
  );
}

function CrowdForm({ invite, onChange }: { invite: CrowdInvite; onChange: (invite: Invite) => void }) {
  const set = <K extends keyof CrowdInvite>(key: K, value: CrowdInvite[K] | undefined) => {
    const next = { ...invite, [key]: value };
    if (value === undefined) delete next[key];
    onChange(next);
  };
  const count = (value: string) => (value === "" ? undefined : Math.max(1, Number(value)));
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={invite.coderParam !== undefined}
            onChange={(e) => set("coderParam", e.target.checked ? { param: "PROLIFIC_PID" } : undefined)}
          />
          Coder id from a URL parameter
          <HelpButton topic="online-panels" label="Help: online panels" />
        </label>
        {invite.coderParam && (
          <div className="flex flex-wrap items-end gap-3 pl-6">
            <label className={labelClass}>
              URL parameter
              <Input
                className="h-8 w-44 font-mono text-xs font-normal"
                value={invite.coderParam.param}
                onChange={(e) => set("coderParam", { ...invite.coderParam!, param: e.target.value })}
              />
            </label>
            <label className={labelClass}>
              Pattern (optional)
              <Input
                className="h-8 w-44 font-mono text-xs font-normal"
                placeholder="e.g. [0-9a-f]{24}"
                value={invite.coderParam.pattern ?? ""}
                onChange={(e) => set("coderParam", { ...invite.coderParam!, pattern: e.target.value || undefined })}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs">
              <input
                type="checkbox"
                checked={invite.coderParam.optional !== true}
                onChange={(e) =>
                  set("coderParam", { ...invite.coderParam!, optional: e.target.checked ? undefined : true })
                }
              />
              Required
            </label>
            <InfoTip label="About coder ids">
              The coder&apos;s id, e.g. from a panel: <span className="font-mono">$session.coder</span> (use it in a
              panel&apos;s return link) and the <span className="font-mono">coder</span> column of the results.
              Required: a link without it, or with a value not matching the pattern, doesn&apos;t start. Not required: a
              link without it starts a session without an id.
            </InfoTip>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={invite.login === true}
            onChange={(e) => set("login", e.target.checked ? true : undefined)}
          />
          Coders sign in
          <InfoTip label="About signing in">
            Opening the link asks coders to sign in. You see their email address, and it identifies them: no coder ids
            needed. Without this, coders may still sign in to keep their work across devices, but you don&apos;t see
            their address.
          </InfoTip>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold">
          Max. nr of coders
          <Input
            type="number"
            min={1}
            className="h-8 w-24 text-xs font-normal"
            placeholder="no limit"
            value={invite.maxCoders ?? ""}
            onChange={(e) => set("maxCoders", count(e.target.value))}
          />
          <InfoTip label="About the most coders">
            The link starts at most this many sessions (the sample size).
          </InfoTip>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Whether the units are divided among the coders, or every coder codes all of them, is set per unit loop (its
        Units settings).
      </p>
    </section>
  );
}

/** Per study: the settings last used in each mode, to come back to after switching (kept while the page is open). */
const modeMemory = new Map<number | string, Partial<Record<Invite["mode"], Invite>>>();
function rememberedModes(studyId: number | undefined): Partial<Record<Invite["mode"], Invite>> {
  const key = studyId ?? "none";
  if (!modeMemory.has(key)) modeMemory.set(key, {});
  return modeMemory.get(key)!;
}
