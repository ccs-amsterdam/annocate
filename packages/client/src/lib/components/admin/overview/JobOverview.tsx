import type { ReactNode } from "react";
import { ChevronRight, CircleDot, FilePen, PauseCircle, CircleOff } from "lucide-react";
import type { AdminClient } from "../../../api/httpAdminClient";
import {
  useCodebooksQuery,
  useDeploymentQuery,
  useDeploymentStatusQuery,
  useInvitesQuery,
  useOverviewQuery,
} from "../../../admin/queries";
import { describeVersions } from "../../../codebook/versions";
import { formatWhen } from "../../../admin/format";
import { JobSettings } from "../JobSettings";
import { ActivityChart } from "./ActivityChart";
import { LoopProgress } from "./LoopProgress";

export type OverviewTarget = "Units" | "Invitations" | "Coders";

interface JobOverviewProps {
  client: AdminClient;
  onNavigate: (tab: OverviewTarget) => void;
  /** Opens the Codebook tab on this version. */
  onOpenCodebook: (versionId: number) => void;
  onDeleted?: () => void;
}

/**
 * The job's front page (docs/plan-job-admin.md): whether it's live, which
 * codebook versions are live and in draft, units, coders, activity and
 * progress, and the job settings.
 */
export function JobOverview({ client, onNavigate, onOpenCodebook, onDeleted }: JobOverviewProps) {
  const overviewQuery = useOverviewQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const codebooksQuery = useCodebooksQuery(client);
  const invitesQuery = useInvitesQuery(client);
  const deployment = deploymentQuery.data ?? null;
  const statusQuery = useDeploymentStatusQuery(client, deployment !== null);

  const codebooks = codebooksQuery.data ?? [];
  const versions = describeVersions(codebooks, deployment?.codebookId ?? null);
  const overview = overviewQuery.data;
  const openInvites = (invitesQuery.data ?? []).filter(
    (i) => !i.revokedAt && (i.maxUses === undefined || i.uses < i.maxUses),
  ).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Card title="Status">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <LiveStatus live={deployment !== null} active={deployment?.active ?? false} since={deployment?.updated ?? null} />
          <VersionLink
            icon={CircleDot}
            label="Live version"
            version={versions.liveId}
            number={versions.liveId !== null ? versions.numberOf(versions.liveId) : null}
            note={codebooks.find((c) => c.id === versions.liveId)?.note ?? null}
            empty="None published"
            onOpen={onOpenCodebook}
          />
          <VersionLink
            icon={FilePen}
            label="Draft"
            version={versions.draftId}
            number={versions.draftId !== null ? versions.numberOf(versions.draftId) : null}
            note={null}
            empty="No unpublished changes"
            onOpen={onOpenCodebook}
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Units"
          value={overview?.units}
          detail={overview && `${overview.unitsets.length} unitset${overview.unitsets.length === 1 ? "" : "s"}`}
          onClick={() => onNavigate("Units")}
        />
        <StatTile
          label="Coders started"
          value={overview?.coders.started}
          detail={overview && `of ${overview.coders.total} · ${overview.coders.activeLastDay} active today`}
          onClick={() => onNavigate("Coders")}
        />
        <StatTile
          label="Finished codings"
          value={overview?.codings}
          detail={overview && `${overview.answers} answers · last ${formatWhen(overview.lastActivity)}`}
          onClick={() => onNavigate("Coders")}
        />
        <StatTile
          label="Open invitations"
          value={invitesQuery.data ? openInvites : undefined}
          detail={invitesQuery.data && `of ${invitesQuery.data.length}`}
          onClick={() => onNavigate("Invitations")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Answers per day" subtitle="Last 30 days">
          {overview ? <ActivityChart activity={overview.activity} /> : <Loading />}
        </Card>

        <Card title="Progress" subtitle="Complete units per loop and unitset">
          {deployment === null ? (
            <p className="text-sm text-muted-foreground">Publish a codebook version to start coding.</p>
          ) : statusQuery.data ? (
            <LoopProgress status={statusQuery.data} />
          ) : statusQuery.isError ? (
            <p className="text-sm text-muted-foreground">Progress can&apos;t be loaded right now.</p>
          ) : (
            <Loading />
          )}
        </Card>
      </div>

      {overview && overview.unitsets.length > 0 && (
        <Card title="Unitsets">
          <ul className="flex flex-wrap gap-2">
            {overview.unitsets.map((u) => (
              <li key={u.name} className="rounded-md bg-muted px-2 py-1 text-xs">
                <span className="font-mono">{u.name}</span>
                <span className="text-muted-foreground"> · {u.units} units</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Settings">
        <JobSettings client={client} onDeleted={onDeleted} />
      </Card>
    </div>
  );
}

function LiveStatus({ live, active, since }: { live: boolean; active: boolean; since: Date | null }) {
  const [Icon, label, detail, className] = !live
    ? [CircleOff, "Not published", "Coders can't start yet", "text-muted-foreground"]
    : active
      ? [CircleDot, "Live", `Since ${formatWhen(since)}`, "text-primary"]
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
          title={`Open v${number} in the codebook editor`}
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

function StatTile({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: number | undefined;
  detail?: string | false;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/50"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value === undefined ? "…" : value.toLocaleString()}
      </span>
      {detail && <span className="mt-0.5 text-xs text-muted-foreground">{detail}</span>}
    </button>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
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
