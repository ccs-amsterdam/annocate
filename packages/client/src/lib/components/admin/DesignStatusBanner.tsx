import type { ReactNode } from "react";
import { CircleDot, FilePen, History, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
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
        title={`Viewing v${openNumber}${openIsLive ? " · live" : " · older version"} · read only`}
        actions={
          <>
            {onRestore && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRestore}>
                Restore as draft
              </Button>
            )}
            {onBackToCurrent && (
              <Button size="sm" className="h-7 text-xs" onClick={onBackToCurrent}>
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
        title={openIsLive ? `v${openNumber} · live` : `v${openNumber} · deployed before`}
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
      title={`Draft v${openNumber} · not live yet`}
    >
      {liveNumber !== null
        ? `Coders are using v${liveNumber} until you deploy this draft.`
        : "Nothing is deployed yet, so coders can't start this study. Deploy when it's ready."}
    </Banner>
  );
}

const TONES = {
  live: { box: "border-ember/40 bg-ember/10", icon: "text-ember" },
  draft: { box: "border-amber-500/50 bg-amber-500/10", icon: "text-amber-600 dark:text-amber-400" },
  history: { box: "border-border bg-muted", icon: "text-muted-foreground" },
};

/** A compact status chip: the title on one line, the explanation behind an info icon, actions beside it. */
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
    <div role="status" className="flex min-w-0 flex-wrap items-center gap-2">
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground", TONES[tone].box)}>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", TONES[tone].icon)} />
        <span className="truncate">{title}</span>
        <InfoTip label="About this version">{children}</InfoTip>
      </span>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
