import { ArrowLeft, ArrowRight, MousePointerClick } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { TabId } from "../../../admin/tabs";
import { GUIDE_TOPICS, topicById } from "./guideSteps";
import { closeGuide, setGuide, startShowMe, useGuide } from "./guideStore";
import { GuideSample } from "./GuideSample";

/**
 * The guide (docs/client.md §7, "Guide"): a step at a time, over the
 * researcher's own page. Each step says one thing, shows it on the sample
 * study and can point at the real button ("Show me", which goes to its page).
 * A topic alone ends with Done; the full guide goes on through every topic.
 */
export function GuideDialog({ onGoTo }: { onGoTo: (page: TabId) => void }) {
  const guide = useGuide();
  if (!guide) return null;
  const topic = topicById(guide.topic);
  const step = topic.steps[Math.min(guide.step, topic.steps.length - 1)];
  const topicIndex = GUIDE_TOPICS.indexOf(topic);
  const nextTopic = GUIDE_TOPICS[topicIndex + 1];
  const lastStep = guide.step >= topic.steps.length - 1;
  const atEnd = lastStep && (!guide.full || !nextTopic);

  const go = (topicId: string, stepIndex = 0) => setGuide({ ...guide, topic: topicId, step: stepIndex });
  const next = () => {
    if (!lastStep) go(topic.id, guide.step + 1);
    else if (guide.full && nextTopic) go(nextTopic.id);
    else closeGuide(guide.full);
  };
  const back = () => {
    if (guide.step > 0) go(topic.id, guide.step - 1);
    else if (guide.full && topicIndex > 0) {
      const previous = GUIDE_TOPICS[topicIndex - 1];
      go(previous.id, previous.steps.length - 1);
    }
  };
  const canGoBack = guide.step > 0 || (guide.full && topicIndex > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && closeGuide()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-4 overflow-y-auto sm:max-w-5xl">
        <div className="flex flex-col gap-1 pr-6">
          <p className="text-xs font-medium text-muted-foreground">
            Guide · {topic.title}
            {guide.full && (
              <span className="ml-1">
                ({topicIndex + 1} of {GUIDE_TOPICS.length})
              </span>
            )}
          </p>
          <DialogTitle className="font-heading text-xl">{step.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-1.5 text-sm text-foreground">
              {step.text.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          </DialogDescription>
        </div>

        {step.sample && <GuideSample sample={step.sample} />}

        {guide.full && (
          <div className="flex justify-center gap-1" aria-hidden>
            {GUIDE_TOPICS.map((t, i) => (
              <span
                key={t.id}
                className={cn("h-1.5 w-6 rounded-full", i <= topicIndex ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canGoBack && (
            <Button variant="ghost" size="sm" onClick={back} className="gap-1">
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
            {!guide.full &&
              step.jumps?.map((j) => (
                <Button key={j.topic} variant="outline" size="sm" onClick={() => go(j.topic)}>
                  {j.label}
                </Button>
              ))}
            <Button size="sm" onClick={next} className="gap-1">
              {atEnd ? (
                "Done"
              ) : lastStep && guide.full ? (
                <>
                  {nextTopic.title} <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
