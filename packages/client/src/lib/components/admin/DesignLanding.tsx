import type { ReactNode } from "react";
import { ArrowRight, BookOpen, Layers } from "lucide-react";
import { collectQuestions, unitLoops, type TopLevelItem } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useDeploymentQuery,
  useDesignVersionQuery,
  useDesignVersionsQuery,
  useUnitFieldsQuery,
  useUnitsQuery,
} from "../../admin/queries";
import { describeVersions } from "../../design/versions";

/**
 * The Design section's start (docs/client.md §7): the two parts of a design,
 * the design (Editor) and the units, as two cards with what they hold
 * now. Picking one opens it; from there the sub tabs switch between them.
 * So a researcher sees both parts, instead of landing in the editor and
 * missing the units.
 */
export function DesignLanding({
  client,
  onOpen,
}: {
  client: ResearcherApi;
  onOpen: (page: "Editor" | "Units") => void;
}) {
  const versionsQuery = useDesignVersionsQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const versions = describeVersions(versionsQuery.data ?? [], deploymentQuery.data?.designVersionId ?? null);
  const current = useDesignVersionQuery(client, versions.currentId);
  const unitsQuery = useUnitsQuery(client);
  const fieldsQuery = useUnitFieldsQuery(client);

  const live = versions.liveId === null ? null : versions.numberOf(versions.liveId);
  const draft = versions.draftId === null ? null : versions.numberOf(versions.draftId);
  const items = (current.data?.items ?? []) as TopLevelItem[];
  const questions = current.data ? collectQuestions(items).questions.size : null;
  const loops = current.data ? unitLoops(items).length : null;
  const units = unitsQuery.data?.length ?? null;
  const fields = fieldsQuery.data ?? [];
  // Questions only: no units

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 py-2 sm:grid-cols-2">
      <DesignCard
        icon={<BookOpen className="h-6 w-6" />}
        title="Editor"
        description="The design: the questions coders answer, and the unit loops that show them the units."
        action="Open the editor"
        onClick={() => onOpen("Editor")}
      >
        <Fact label="Coders use">
          {live === null ? <span className="text-muted-foreground">nothing yet: not deployed</span> : `v${live}`}
        </Fact>
        <Fact label="Draft">
          {draft === null ? (
            <span className="text-muted-foreground">none: editing makes one</span>
          ) : (
            `v${draft}, not deployed yet`
          )}
        </Fact>
        {questions !== null && (
          <Fact label="Contents">
            {questions} question{questions === 1 ? "" : "s"}
            {loops ? `, ${loops} unit loop${loops === 1 ? "" : "s"}` : ""}
          </Fact>
        )}
      </DesignCard>
      {
        <DesignCard
          icon={<Layers className="h-6 w-6" />}
          title="Units"
          description="What coders code: texts, images or other material, uploaded as a table with a column per field."
          action="Open the units"
          onClick={() => onOpen("Units")}
        >
          <Fact label="Units">
            {units === null ? (
              "…"
            ) : units === 0 ? (
              <span className="text-muted-foreground">none yet: upload a file</span>
            ) : (
              units
            )}
          </Fact>
          <Fact label="Columns">
            {fields.length === 0 ? (
              <span className="text-muted-foreground">none yet</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {fields.map((f) => (
                  <span
                    key={f.name}
                    className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]"
                    title={f.description}
                  >
                    {f.name} <span className="text-muted-foreground">{f.type}</span>
                  </span>
                ))}
              </span>
            )}
          </Fact>
        </DesignCard>
      }
    </div>
  );
}

function DesignCard({
  icon,
  title,
  description,
  action,
  onClick,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-colors hover:border-wood/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-wood/10 p-2.5 text-wood">{icon}</span>
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <dl className="flex flex-col gap-1.5 text-sm">{children}</dl>
      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary">
        {action}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
