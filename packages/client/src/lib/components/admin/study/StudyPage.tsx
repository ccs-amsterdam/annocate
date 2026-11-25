import type { ReactNode } from "react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import type { TabId } from "../../../admin/tabs";
import type { DesignBackup } from "../../../design/localBackup";
import type { SaveFn } from "../DesignEditor";
import { DesignManager } from "../DesignManager";
import { DeployPage } from "../DeployPage";
import { LinksPanel } from "../LinksPanel";
import { StudyOverview, StudySettingsPage } from "../overview/StudyOverview";
import { ResultsPanel } from "../results/ResultsPanel";
import { StudyPreview } from "../StudyPreview";
import { UnitsPage } from "../units/UnitsPage";
import { CodersPage } from "../coders/CodersPage";

/** What a study's pages get. */
export interface StudyPageProps {
  client: ResearcherApi;
  coderApiUrl?: string;
  /** Goes to another page of the study. */
  goTo: (tab: TabId) => void;
  onBackToStudies: () => void;
  /** The design editor's place in the app. */
  design: {
    /** A design version to open, asked for on the overview; `n` counts the requests (each opens the editor anew). */
    target: { id: number; n: number } | null;
    /** Opens a design version in the editor. */
    open: (id: number) => void;
    /** The editor's version (its number), from the URL. */
    version?: number;
    onVersionChange: (version: number | undefined) => void;
    /** Unsaved edits from an earlier session to continue with. */
    restore: DesignBackup | null;
    onDirtyChange: (dirty: boolean) => void;
    registerSave: (save: SaveFn | null) => void;
  };
}

const PAGES: Record<TabId, (props: StudyPageProps) => ReactNode> = {
  Overview: ({ client, goTo, design }) => (
    <StudyOverview client={client} onNavigate={goTo} onOpenDesign={design.open} />
  ),
  Settings: ({ client, onBackToStudies }) => <StudySettingsPage client={client} onDeleted={onBackToStudies} />,
  Design: ({ client, goTo, design }) => (
    <DesignManager
      key={`${design.target?.n ?? 0}:${design.restore?.at ?? ""}`}
      initialVersionId={design.target?.id ?? null}
      initialVersion={design.version}
      onVersionChange={design.onVersionChange}
      restore={design.restore}
      client={client}
      onDirtyChange={design.onDirtyChange}
      registerSave={design.registerSave}
      onOpenDeploy={() => goTo("Deploy")}
    />
  ),
  Deploy: ({ client, goTo }) => (
    <DeployPage client={client} onOpenDesign={() => goTo("Design")} onOpenCoders={() => goTo("Coders")} />
  ),
  Units: ({ client, goTo }) => <UnitsPage client={client} onOpenCoders={() => goTo("Coders")} />,
  Coders: ({ client }) => <CodersPage client={client} />,
  Links: ({ client }) => <LinksPanel client={client} />,
  Results: ({ client }) => <ResultsPanel client={client} />,
  Preview: ({ client, coderApiUrl }) => <StudyPreview client={client} coderApiUrl={coderApiUrl} />,
};

/** The study's current page. */
export function StudyPage({ tab, ...props }: StudyPageProps & { tab: TabId }) {
  return PAGES[tab](props);
}
