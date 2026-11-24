import { useState } from "react";
import { Compass } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { TabId } from "../../../admin/tabs";
import { topicById, topicForPage } from "./guideSteps";
import { fullGuideProgress, openGuide } from "./guideStore";

/** In the study's header: the guide for this page, or the full guide (from where it was left). */
export function GuideButton({ page }: { page: TabId }) {
  const [open, setOpen] = useState(false);
  const topic = topicById(topicForPage(page));
  const started = fullGuideProgress() !== null;
  const item = (title: string, text: string, onClick: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full flex-col items-start rounded-md p-2 text-left hover:bg-muted"
    >
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{text}</span>
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <Compass className="h-3.5 w-3.5" />
          Guide
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5" role="menu">
        {item(`This page: ${topic.title}`, "A short explanation, shown on a sample study.", () => openGuide(topic.id))}
        {item(
          started ? "Continue the full guide" : "The full guide",
          "Every step, from the design to the results.",
          () => openGuide(undefined, { full: true }),
        )}
        {started &&
          item("The full guide from the start", "Every step again.", () =>
            openGuide(undefined, { full: true, fromStart: true }),
          )}
      </PopoverContent>
    </Popover>
  );
}
