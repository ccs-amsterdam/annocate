import { useState } from "react";
import { ArrowLeft, ArrowRight, Menu, MousePointerClick } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { TabId } from "../../../admin/tabs";
import { GUIDE_FLOW, GUIDE_SECTIONS } from "./guideSteps";
import { closeGuide, goTo, startShowMe, useGuide } from "./guideStore";
import { GuideSample } from "./GuideSample";

/**
 * The guide (docs/client.md §7, "Guide"): like the help, a menu of its
 * sections and their steps beside the open step, over the researcher's own
 * page. A step says one thing, shows it on the sample study and can point at
 * the real button ("Show me", which goes to its page). Next and Back go
 * through all steps in order. Its height doesn't change between steps.
 */
export function GuideDialog({ onGoTo }: { onGoTo: (page: TabId) => void }) {
  const guide = useGuide();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!guide) return null;
  const section = GUIDE_SECTIONS[guide.section];
  const step = section.steps[guide.step] ?? section.steps[0];
  const at = GUIDE_FLOW.findIndex((f) => f.s === guide.section && f.i === guide.step);
  const previous = GUIDE_FLOW[at - 1];
  const next = GUIDE_FLOW[at + 1];

  const menu = (
    <nav aria-label="Guide" className="flex flex-col gap-3 text-sm">
      {GUIDE_SECTIONS.map((sec, s) => (
        <div key={sec.page} className="flex flex-col gap-0.5">
          <span className="px-2 text-xs font-semibold text-muted-foreground">{sec.title}</span>
          {sec.steps.map((st, i) => {
            const current = s === guide.section && i === guide.step;
            return (
              <button
                key={st.id}
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => {
                  goTo({ section: s, step: i });
                  setMenuOpen(false);
                }}
                className={cn(
                  "rounded-md px-2 py-1 text-left transition-colors",
                  current ? "bg-wood/15 font-medium text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {st.title}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && closeGuide()}>
      <DialogContent className="flex h-[min(54rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-6xl gap-0 overflow-hidden p-0 sm:max-w-6xl">
        {/* The menu: beside the step on wide screens, behind a button on narrow ones */}
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 md:block">
          {menu}
        </aside>
        {menuOpen && (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-card p-4 md:hidden">
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => setMenuOpen(false)}>
              <ArrowLeft className="h-4 w-4" /> Back to the step
            </Button>
            {menu}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <div className="flex flex-col gap-1 pr-8">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="The guide's contents"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <p className="text-xs font-medium text-muted-foreground">Guide · {section.title}</p>
            </div>
            <DialogTitle className="font-heading text-xl">{step.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-1.5 text-sm text-foreground">
                {step.text.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
            </DialogDescription>
          </div>

          <div className="flex min-h-0 flex-1 items-start justify-center">
            {step.sample && <GuideSample key={`${guide.section}:${guide.step}`} sample={step.sample} />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {previous && (
              <Button variant="ghost" size="sm" onClick={() => goTo({ section: previous.s, step: previous.i })}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => closeGuide()}>
              Close
            </Button>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {step.showMe && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const { page, target, label } = step.showMe!;
                    startShowMe({ target, label });
                    onGoTo(page);
                  }}
                >
                  <MousePointerClick className="h-4 w-4" /> Show me
                </Button>
              )}
              {next ? (
                <Button size="sm" className="gap-1" onClick={() => goTo({ section: next.s, step: next.i })}>
                  {next.step.title} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => closeGuide()}>
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
