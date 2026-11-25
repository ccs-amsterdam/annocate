import { useState } from "react";
import {
  CODER_SET,
  firstInvite,
  inviteKind,
  type CoderKind,
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
import { columnValues } from "../../../design/assignment";
import { InviteChecks } from "../coders/InviteChecks";
import { withOptional, withOptionals } from "../../../design/itemSettings";
import { IssueList } from "../IssueList";
import { issuesAt } from "../issues";
import { CoderSetDialog } from "./CoderSetDialog";
import { useCoderKind } from "./coderKind";
import { WHO_CODES } from "./whoCodes";
import { openGuide } from "../guide/guideStore";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs font-normal";
const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/**
 * How the study's coders get in (the Study entry's `invite`,
 * docs/architecture.md §6, docs/plans/unit-sets.md), for the study's kind
 * of coders: expert coders (the values of the units' `coder_set`, each with
 * their own units; a link each, one link where they pick their name, or one
 * where they sign in with their email address), or a crowd's one link (for
 * anyone: a survey, an experiment, or a crowd; an optional coder id from
 * the URL, a maximum of coders). Whether one link's coders divide the units
 * is each unit loop's. The kind itself is the study's (its Settings).
 */
export function InvitationSettings({
  invite,
  groups,
  issues,
  client,
  onChange,
}: {
  invite: Invite;
  groups: SetGroupResponse[];
  issues: DesignIssue[];
  /** To make the coder set (absent: read only). */
  client?: ResearcherApi;
  onChange: (invite: Invite) => void;
}) {
  // The study's kind of coders (outside a design editor: the invitation's)
  const kind = useCoderKind() ?? inviteKind(invite);
  // An invitation for the other kind (a design written elsewhere): the form starts from this kind's first one
  const fits = inviteKind(invite) === kind;
  const shown = fits ? invite : firstInvite(kind);

  return (
    <div className="flex flex-col gap-4">
      <StudyCoders kind={kind} />
      {!fits && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(shown)}>
          Use {kind === "expert" ? "an invitation for expert coders" : "a crowd's invitation"}
        </Button>
      )}
      {shown.mode === "coders" ? (
        <CodersForm invite={shown} groups={groups} client={client} onChange={onChange} />
      ) : (
        <CrowdForm invite={shown} onChange={onChange} />
      )}
      <IssueList issues={issuesAt(issues, "invite")} />
    </div>
  );
}

/** Who codes in this study: said, not chosen here (the study's setting). */
function StudyCoders({ kind }: { kind: CoderKind }) {
  const { icon: Icon, title, short } = WHO_CODES[kind];
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2.5">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {short}. Chosen for the study: it can be changed in the study&apos;s Settings until the first deploy.
      </span>
      <button
        type="button"
        onClick={() => openGuide("Design", "modes")}
        className="self-start text-xs text-primary hover:underline"
      >
        Learn more about who codes
      </button>
    </div>
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
  const coders = columnValues(groups, CODER_SET).length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold">
          Coder set
          <InfoTip label="About the coder set">
            The units&apos; column <span className="font-mono">coder_set</span> says who codes each unit (
            <span className="font-mono">anna</span>, <span className="font-mono">anna;bob</span> for both), by the ids
            of your expert coders. Test units (<span className="font-mono">test_set</span>: overlap, practice, gold) go
            to everyone. Add coders and make it here, or on the Coders page.
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
          A coder set is required: it says who codes which units. Create one here, or on the Coders page.
        </p>
      ) : coders === 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">The coder set has no coders yet.</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {coders} coder{coders === 1 ? "" : "s"} in the coder set.
        </p>
      )}
      {/* Disabled until there is a coder set: the links and names come from it */}
      <fieldset className="flex flex-col gap-1 disabled:opacity-50" disabled={!known}>
        <legend className="mb-1 text-xs font-semibold">How coders get in</legend>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={invite.link === "per_coder"}
            onChange={() => onChange(withOptionals(invite, { link: "per_coder", nameDevices: undefined }))}
          />
          A link per coder (deploying makes them; send each coder theirs)
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            checked={invite.link === "pick_name"}
            onChange={() => onChange({ ...invite, link: "pick_name" })}
          />
          One link: coders pick their coder id from the coder set
        </label>
        {invite.link === "pick_name" && (
          <div className="flex flex-col gap-1 pl-6">
            <select
              aria-label="A picked name"
              className={cn(selectClass, "w-fit")}
              value={invite.nameDevices ?? "first"}
              onChange={(e) =>
                onChange(withOptional(invite, "nameDevices", e.target.value === "any" ? "any" : undefined))
              }
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
            onChange={() => onChange(withOptionals(invite, { link: "login", nameDevices: undefined }))}
          />
          One link: coders sign in with their email address (each coder&apos;s, on the Coders page)
        </label>
      </fieldset>
      {client && <InviteChecks client={client} invite={invite} />}
      <p className="text-[11px] text-muted-foreground">
        Coders can always sign in to keep their work across devices; unless they sign in to start (the last option), you
        don&apos;t see the address they sign in with.
      </p>
      {making && client && <CoderSetDialog client={client} groups={groups} onDone={() => setMaking(false)} />}
    </section>
  );
}

function CrowdForm({ invite, onChange }: { invite: CrowdInvite; onChange: (invite: Invite) => void }) {
  const set = <K extends keyof CrowdInvite>(key: K, value: CrowdInvite[K] | undefined) =>
    onChange(withOptional(invite, key, value));
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
                onChange={(e) =>
                  set("coderParam", withOptional(invite.coderParam!, "pattern", e.target.value || undefined))
                }
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
          <InfoTip label="About the most coders">The link starts at most this many sessions (the sample size).</InfoTip>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Whether the units are divided among the coders, or every coder codes all of them, is set per unit loop (its
        Units settings).
      </p>
    </section>
  );
}
