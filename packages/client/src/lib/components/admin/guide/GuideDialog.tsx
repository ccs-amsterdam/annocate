import { useState } from "react";
import { ArrowLeft, ArrowRight, Menu, MousePointerClick } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { TabId } from "../../../admin/tabs";
import { HelpMarkdown } from "../../../help/HelpMarkdown";
import { GUIDE_FLOW, GUIDE_SECTIONS } from "./guideSteps";
import { closeGuide, goTo, startShowMe, useGuide } from "./guideStore";
import { GuideSample } from "./GuideSample";
import type { GuideStep } from "./parseGuide";
import { isTallSample } from "./pictures";

type FlowStep = (typeof GUIDE_FLOW)[number];
const open = (to: FlowStep) => goTo({ section: to.s, step: to.i });

/**
 * The guide (docs/client.md §7, "Guide"): like the help, a menu of its
 * sections and their steps beside the open step, over the researcher's own
 * page. A step says one thing in a few lines, shows it in a picture and can
 * point at the real button ("Show me", which goes to its page). Next and Back
 * go through all steps in order. Its height doesn't change between steps.
 */
export function GuideDialog({ onGoTo }: { onGoTo: (page: TabId) => void }) {
  const guide = useGuide();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!guide) return null;
  const at = Math.max(
    0,
    GUIDE_FLOW.findIndex((f) => f.s === guide.section && f.i === guide.step),
  );
  const current = GUIDE_FLOW[at];
  const menu = <GuideMenu current={current} onChosen={() => setMenuOpen(false)} />;

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

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
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
              <p className="text-xs font-medium text-muted-foreground">Guide · {GUIDE_SECTIONS[current.s].title}</p>
            </div>
            <DialogTitle className="font-heading text-xl">{current.step.title}</DialogTitle>
          </div>
          <StepBody key={current.step.id} step={current.step} />
          <StepButtons step={current.step} previous={GUIDE_FLOW[at - 1]} next={GUIDE_FLOW[at + 1]} onGoTo={onGoTo} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The sections and their steps: a click opens a step. */
function GuideMenu({ current, onChosen }: { current: FlowStep; onChosen: () => void }) {
  return (
    <nav aria-label="Guide" className="flex flex-col gap-3 text-sm">
      {GUIDE_SECTIONS.map((section, s) => (
        <div key={section.page} className="flex flex-col gap-0.5">
          <span className="px-2 text-xs font-semibold text-primary">{section.title}</span>
          {GUIDE_FLOW.filter((f) => f.s === s).map((f) => (
            <button
              key={f.step.id}
              type="button"
              aria-current={f === current ? "step" : undefined}
              onClick={() => {
                open(f);
                onChosen();
              }}
              className={cn(
                "rounded-md px-2 py-1 text-left transition-colors",
                f === current ? "bg-leaf/15" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.step.title}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * A step's text and its picture: the text above the picture, or on a wide
 * screen beside a picture that is taller than wide. A text too long for the
 * space scrolls with its picture.
 */
function StepBody({ step }: { step: GuideStep }) {
  const beside = step.sample !== undefined && isTallSample(step.sample);
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", beside && "lg:flex-row lg:gap-6")}>
      <DialogDescription asChild>
        <div className={cn("help-prose guide-prose shrink-0", beside ? "lg:w-80" : "max-w-3xl")}>
          <HelpMarkdown slug="" body={step.body} />
        </div>
      </DialogDescription>
      {step.sample && (
        <div className="min-h-48 min-w-0 flex-1">
          <GuideSample sample={step.sample} />
        </div>
      )}
    </div>
  );
}

/** Back and Close; Show me (where the step has it) and the next step, or Done. */
function StepButtons({
  step,
  previous,
  next,
  onGoTo,
}: {
  step: GuideStep;
  previous?: FlowStep;
  next?: FlowStep;
  onGoTo: (page: TabId) => void;
}) {
  const { showMe } = step;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {previous && (
        <Button variant="ghost" size="sm" onClick={() => open(previous)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => closeGuide()}>
        Close
      </Button>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {showMe && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              startShowMe({ target: showMe.target, label: showMe.label });
              onGoTo(showMe.page);
            }}
          >
            <MousePointerClick className="h-4 w-4" /> Show me
          </Button>
        )}
        {next ? (
          <Button size="sm" className="gap-1" onClick={() => open(next)}>
            {next.step.title} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => closeGuide()}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
