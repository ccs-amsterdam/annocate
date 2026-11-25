import type { StudyResponse } from "@annotinder/contracts";
import { Archive, ChevronLeft, CircleHelp, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { TabId } from "../../../admin/tabs";
import { CollapsibleHeader } from "../../../hooks/useCollapsingChrome";
import { openHelp } from "../../../help/helpStore";
import { GuideButton } from "../guide/GuideButton";
import { STUDY_PAGES } from "./studyPages";

/** The help topic the Help button opens on each page. */
const TAB_HELP: Record<TabId, string> = {
  Overview: "overview",
  Design: "design-editor",
  Units: "uploading-units",
  Coders: "coders-and-progress",
  Deploy: "previewing-and-publishing",
  Links: "links",
  Results: "results",
  Settings: "overview",
  Preview: "previewing-and-publishing",
};

/**
 * The study's header: back to the studies, which study (and switching to
 * another), its pages, the guide, help and Preview. Hides while scrolling
 * down (useCollapsingChrome).
 */
export function StudyHeader({
  study,
  studies,
  tab,
  onTabChange,
  onBackToStudies,
  onSwitchStudy,
}: {
  study: StudyResponse;
  /** The researcher's studies, to switch to. */
  studies: StudyResponse[];
  tab: TabId;
  onTabChange: (tab: TabId) => void;
  onBackToStudies: () => void;
  onSwitchStudy: (studyId: number) => void;
}) {
  return (
    <CollapsibleHeader>
      <header className="border-b border-border bg-card/60 px-3 backdrop-blur-sm sm:px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <IconButton icon={ChevronLeft} label="All studies" onClick={onBackToStudies} />
            <select
              aria-label="Study"
              value={study.id}
              onChange={(e) => onSwitchStudy(Number(e.target.value))}
              className="max-w-[16rem] truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-foreground hover:border-input focus:border-input focus:ring-1 focus:ring-primary focus:outline-none"
            >
              {studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {study.archived && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Archive className="h-3 w-3" /> Archived
              </span>
            )}
          </div>

          <nav className="flex gap-0.5 overflow-x-auto" aria-label="Study">
            {STUDY_PAGES.map((page) => (
              <PageButton key={page.id} page={page} active={page.id === tab} onClick={() => onTabChange(page.id)} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <GuideButton page={tab} />
            <IconButton icon={CircleHelp} label="Help" onClick={() => openHelp(TAB_HELP[tab])} />
            <Button
              data-guide="preview"
              variant={tab === "Preview" ? "default" : "outline"}
              size="sm"
              onClick={() => onTabChange("Preview")}
              className="h-8 gap-1.5 text-xs"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Preview
            </Button>
          </div>
        </div>
      </header>
    </CollapsibleHeader>
  );
}

function PageButton({
  page,
  active,
  onClick,
}: {
  page: (typeof STUDY_PAGES)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = page.icon;
  return (
    <button
      type="button"
      data-guide={`tab-${page.id}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-wood/15 text-foreground ring-1 ring-wood/30 ring-inset"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {page.label}
    </button>
  );
}
