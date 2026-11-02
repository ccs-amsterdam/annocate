import type { ReactNode } from "react";
import { CircleDot, FilePen, History, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { DesignEditorMode } from "./DesignEditor";

interface DesignStatusBannerProps {
  mode: DesignEditorMode;
  /** Version number of the opened codebook; null for a new, unsaved codebook. */
  openNumber: number | null;
  /** Version number of the live design version; null if nothing was deployed yet. */
  liveNumber: number | null;
  /** Version number of the draft, if there is one. */
  draftNumber: number | null;
  onRestore?: () => void;
  onBackToCurrent?: () => void;
}

/**
 * Says which version is open, whether coders are using it, and what to do
 * to change it (docs/client.md §7).
 */
export function DesignStatusBanner({
  mode,
  openNumber,
  liveNumber,
  draftNumber,
  onRestore,
  onBackToCurrent,
}: DesignStatusBannerProps) {
  const openIsLive = openNumber !== null && openNumber === liveNumber;

  if (openNumber === null) {
    return (
      <Banner tone="draft" icon={Sparkles} title="New design">
        Save it as a draft, and deploy it when coders can start.
      </Banner>
    );
  }

  if (mode === "history") {
    return (
      <Banner
        tone="history"
        icon={History}
        title={`Viewing v${openNumber}${openIsLive ? ", the live version" : ", an older version"}`}
        actions={
          <>
            {onRestore && (
              <Button size="sm" variant="outline" onClick={onRestore}>
                Restore as draft
              </Button>
            )}
            {onBackToCurrent && (
              <Button size="sm" onClick={onBackToCurrent}>
                Back to {draftNumber !== null ? "draft" : "current version"}
              </Button>
            )}
          </>
        }
      >
        This version is read only.
        {openIsLive && draftNumber !== null && ` You are working on a draft (v${draftNumber}).`}
      </Banner>
    );
  }

  if (mode === "live") {
    return (
      <Banner
        tone="live"
        icon={CircleDot}
        title={openIsLive ? `v${openNumber} is live: coders are using it` : `v${openNumber} was deployed before`}
      >
        It can't be changed anymore, so your edits are saved as a new draft.
        {openIsLive && ` Coders keep using v${openNumber} until you publish the draft.`}
      </Banner>
    );
  }

  return (
    <Banner
      tone="draft"
      icon={FilePen}
      title={`Draft v${openNumber}: not live yet`}
    >
      {liveNumber !== null
        ? `Coders are using v${liveNumber} until you deploy this draft.`
        : "Nothing is deployed yet, so coders can't start this job. Deploy when it's ready."}
    </Banner>
  );
}

const TONES = {
  live: { box: "border-primary bg-primary/10", icon: "text-primary" },
  draft: { box: "border-amber-500 bg-amber-500/10", icon: "text-amber-600 dark:text-amber-400" },
  history: { box: "border-slate-400 bg-slate-500/10", icon: "text-slate-600 dark:text-slate-300" },
};

function Banner({
  tone,
  icon: Icon,
  title,
  actions,
  children,
}: {
  tone: keyof typeof TONES;
  icon: typeof History;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn("flex flex-wrap items-center gap-3 rounded-lg border-l-4 px-4 py-2.5", TONES[tone].box)}
    >
      <Icon className={cn("h-5 w-5 shrink-0", TONES[tone].icon)} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold text-foreground">{title}</div>
        <div className="text-foreground/80">{children}</div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
