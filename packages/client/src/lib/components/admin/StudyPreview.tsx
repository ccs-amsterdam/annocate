import { useState } from "react";
import { designItems, sessionItem } from "@annotinder/contracts";
import type { ResearcherApi } from "../../api/httpResearcherApi";
import {
  useDesignVersionQuery,
  useDesignVersionsQuery,
  useDeploymentQuery,
  useSetGroupsQuery,
  useUnitsQuery,
} from "../../admin/queries";
import { describeVersions } from "../../design/versions";
import { StudyRunner } from "../StudyRunner";
import { Button } from "@/components/ui/button";
import { RotateCcw, AlertCircle } from "lucide-react";
import { DeviceFrame } from "./preview/DeviceFrame";
import { INITIAL_VIEW, type DeviceView } from "./preview/devices";
import { PreviewAs } from "./preview/PreviewAs";
import { PreviewToolbar } from "./preview/PreviewToolbar";
import { usePreviewSession, type PreviewSessionState } from "./preview/usePreviewSession";

interface StudyPreviewProps {
  client: ResearcherApi;
  /** Where coder sessions run (`<url>/d/...`); normally the client's own origin (""): session cookies are same-origin. */
  coderApiUrl?: string;
}

/**
 * The Preview page: runs the study's latest design version (the draft, else
 * the live one) in a device frame. The server runs it as a preview
 * deployment: coders and answers stay in its memory, nothing is stored.
 * Each preview session gets a fresh token, and with it a fresh coder.
 */
export function StudyPreview({ client, coderApiUrl = "" }: StudyPreviewProps) {
  const designVersionsQuery = useDesignVersionsQuery(client);
  const deploymentQuery = useDeploymentQuery(client);
  const unitsQuery = useUnitsQuery(client);
  const [view, setView] = useState(INITIAL_VIEW);
  const session = usePreviewSession(client);

  const designVersions = designVersionsQuery.data ?? [];
  const latest = designVersions.at(-1);
  const latestStatus = latest
    ? describeVersions(designVersions, deploymentQuery.data?.designVersionId ?? null).statusOf(latest.id)
    : null;
  const latestVersion = useDesignVersionQuery(client, latest?.id ?? null).data;
  const groups = useSetGroupsQuery(client).data ?? [];
  const hasDesign = designVersions.length > 0;
  const hasUnits = (unitsQuery.data?.length ?? 0) > 0;

  if (designVersionsQuery.isLoading || unitsQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Loading study preview...</p>
      </div>
    );
  }
  if (!hasDesign || !hasUnits) return <NotReady hasDesign={hasDesign} hasUnits={hasUnits} />;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <PreviewToolbar view={view} onChange={setView}>
          <span
            className="rounded-md bg-muted px-2 py-1 text-xs text-foreground"
            title="Preview runs the latest version. Coders keep using the live version until you deploy."
          >
            Previewing v{designVersions.length} ({STATUS_TEXT[latestStatus ?? "history"]})
          </span>
        </PreviewToolbar>
        <PreviewAs
          session={latestVersion ? sessionItem(designItems(latestVersion)) : null}
          groups={groups}
          value={session.as}
          onChange={session.previewAs}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={session.reset}
          className="gap-1.5 text-xs font-semibold"
          disabled={session.creating}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset preview session
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto rounded-2xl bg-muted/20 p-2 sm:p-6">
        <PreviewRunner session={session} coderApiUrl={coderApiUrl} view={view} />
      </div>
    </div>
  );
}

/** How the previewed version stands, in the toolbar. */
const STATUS_TEXT: Record<"draft" | "live" | "history", string> = { draft: "draft", live: "live", history: "not live" };

/** The study as a coder gets it, in its device frame, once the preview session is there. */
function PreviewRunner({
  session,
  coderApiUrl,
  view,
}: {
  session: PreviewSessionState;
  coderApiUrl: string;
  view: DeviceView;
}) {
  if (session.creating)
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="animate-pulse text-sm text-muted-foreground">Initializing preview session...</p>
      </div>
    );
  if (session.error)
    return (
      <div className="p-4 text-center text-sm text-destructive">Failed to initialize preview: {session.error}</div>
    );
  if (!session.preview) return null;
  return (
    <DeviceFrame view={view}>
      <StudyRunner
        key={session.key}
        baseUrl={`${coderApiUrl}/d/${session.preview.deploymentId}`}
        linkSecret={session.preview.token}
        urlParams={session.as}
        newSession={session.wasReset}
        preview={true}
      />
    </DeviceFrame>
  );
}

/** Without a design or units there is nothing to preview: what is missing. */
function NotReady({ hasDesign, hasUnits }: { hasDesign: boolean; hasUnits: boolean }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">Study Not Ready For Preview</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        To preview how this study looks and works for coders, you need:
      </p>
      <ul className="mt-3 space-y-2 rounded-lg bg-muted/50 p-4 text-left text-sm">
        <Requirement met={hasDesign} label="Design with questions" />
        <Requirement met={hasUnits} label="Uploaded units" />
      </ul>
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={met ? "font-bold text-primary" : "text-muted-foreground"}>{met ? "✓" : "○"}</span>
      <span>
        {label} {met ? "(Ready)" : "(Missing)"}
      </span>
    </li>
  );
}
