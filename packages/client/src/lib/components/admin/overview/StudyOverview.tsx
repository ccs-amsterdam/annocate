import type { ReactNode } from "react";
import { ChevronRight, CircleDot, FilePen, PauseCircle, CircleOff } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { CODER_SET } from "@annotinder/contracts";
import {
  useDesignVersionsQuery,
  useDeploymentQuery,
  useLinksQuery,
  useOverviewQuery,
  useWhoCodes,
} from "../../../admin/queries";
import { describeVersions } from "../../../design/versions";
import { formatWhen } from "../../../admin/format";
import { StudySettings } from "../StudySettings";
import { ActivityChart } from "./ActivityChart";
import { TeamSettings } from "./TeamSettings";
import { ExampleNotice } from "./ExampleNotice";

type OverviewTarget = "Units" | "Links" | "Coders" | "Results";

interface StudyOverviewProps {
  client: ResearcherApi;
  onNavigate: (tab: OverviewTarget) => void;
  /** Opens the Design page on this version. */
  onOpenDesign: (versionId: number) => void;
}

/**
 * The study's front page (docs/client.md §7), kept simple: whether it's
 * live (and which design versions are live and in draft), the study in a
 * few facts (who codes, units, coded, last activity, links), and the
 * answers per day. The study's settings are on their own page (`StudySettingsPage`).
 */
export function StudyOverview({ client, onNavigate, onOpenDesign }: StudyOverviewProps) {
  const overviewQuery = useOverviewQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const designVersionsQuery = useDesignVersionsQuery(client);
  const linksQuery = useLinksQuery(client);
  const deployment = deploymentQuery.data ?? null;

  const designVersions = designVersionsQuery.data ?? [];
  const versions = describeVersions(designVersions, deployment?.designVersionId ?? null);
  const who = useWhoCodes(client);
  const overview = overviewQuery.data;
  const openLinks = (linksQuery.data ?? []).filter(
    (link) => !link.revokedAt && !link.retiredAt && (link.maxUses === undefined || link.uses < link.maxUses),
  ).length;
  const experts = overview?.groups.find((g) => g.name === CODER_SET)?.sets.length ?? 0;
  const count = (n: number | undefined, one: string, many = `${one}s`) =>
    n === undefined ? "…" : `${n.toLocaleString()} ${n === 1 ? one : many}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <ExampleNotice client={client} />
      <Card title="Status" tone={deployment?.active ? "leaf" : undefined}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <LiveStatus
            live={deployment !== null}
            active={deployment?.active ?? false}
            since={deployment?.updated ?? null}
          />
          <VersionLink
            icon={CircleDot}
            label="Live version"
            version={versions.liveId}
            number={versions.liveId !== null ? versions.numberOf(versions.liveId) : null}
            note={designVersions.find((c) => c.id === versions.liveId)?.note ?? null}
            empty="None deployed"
            onOpen={onOpenDesign}
          />
          <VersionLink
            icon={FilePen}
            label="Draft"
            version={versions.draftId}
            number={versions.draftId !== null ? versions.numberOf(versions.draftId) : null}
            note={null}
            empty="No changes waiting to be deployed"
            onOpen={onOpenDesign}
          />
        </div>
      </Card>

      {/* The study in a few facts, each opening its page */}
      <Card title="The study">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Fact
            label="Who codes"
            onClick={() => onNavigate("Coders")}
            value={
              who === undefined
                ? "…"
                : who.kind === null
                  ? "not chosen yet"
                  : who.kind === "expert"
                    ? `${count(experts, "expert coder")} · ${overview ? overview.coders.started : "…"} started`
                    : `${count(overview?.coders.started, "crowd coder")} started`
            }
          />
          <Fact label="Units" value={count(overview?.units, "unit")} onClick={() => onNavigate("Units")} />
          <Fact
            label="Coded"
            value={
              overview ? `${count(overview.codings, "finished unit")} · ${count(overview.answers, "answer")}` : "…"
            }
            onClick={() => onNavigate("Results")}
          />
          <Fact
            label="Last activity"
            value={overview ? (overview.lastActivity ? formatWhen(overview.lastActivity) : "None yet") : "…"}
            onClick={() => onNavigate("Coders")}
          />
          <Fact
            label="Links"
            value={linksQuery.data ? `${openLinks} active` : "…"}
            onClick={() => onNavigate("Links")}
          />
        </dl>
      </Card>

      <Card title="Activity" subtitle="Answers per day, the last 30 days">
        {overview ? <ActivityChart activity={overview.activity} /> : <Loading />}
      </Card>
    </div>
  );
}

/** One fact about the study, opening the page it is about. */
function Fact({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 font-medium text-foreground tabular-nums">
        {value}
        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60" />
      </dd>
    </button>
  );
}

/** The study's Settings page: who has access, and the study's settings (name, sessions, archive, delete). */
export function StudySettingsPage({ client, onDeleted }: { client: ResearcherApi; onDeleted?: () => void }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Card title="Who has access" subtitle="People who can see and work on this study">
        <TeamSettings client={client} />
      </Card>
      <Card title="Settings">
        <StudySettings client={client} onDeleted={onDeleted} />
      </Card>
    </div>
  );
}

/** Whether coders can start: not deployed, live, or paused. */
function LiveStatus({ live, active, since }: { live: boolean; active: boolean; since: Date | null }) {
  const [Icon, label, detail, className] = !live
    ? [CircleOff, "Not deployed", "Coders can't start yet", "text-muted-foreground"]
    : active
      ? [CircleDot, "Live", `Since ${formatWhen(since)}`, "text-ember"]
      : [PauseCircle, "Paused", "Coders get no new units", "text-amber-600 dark:text-amber-400"];
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-6 w-6 ${className}`} />
      <div>
        <div className="text-base font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

/** The live or draft design version, to open in the editor. */
function VersionLink({
  icon: Icon,
  label,
  version,
  number,
  note,
  empty,
  onOpen,
}: {
  icon: typeof CircleDot;
  label: string;
  version: number | null;
  number: number | null;
  note: string | null;
  empty: string;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      {version === null ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(version)}
          className="group flex max-w-xs items-center gap-1.5 text-left text-sm font-medium text-foreground hover:text-primary"
          title={`Open v${number} in the design editor`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            v{number}
            {note && <span className="font-normal text-muted-foreground"> · {note}</span>}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" />
        </button>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "leaf";
  children: ReactNode;
}) {
  // tone "leaf": a positive state (the study is live), as a faint tint of the palette's green
  return (
    <section
      className={`rounded-xl border p-4 shadow-xs ${tone === "leaf" ? "border-leaf/40 bg-leaf/10" : "border-border bg-card"}`}
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Loading() {
  return <p className="text-sm text-muted-foreground">Loading...</p>;
}
