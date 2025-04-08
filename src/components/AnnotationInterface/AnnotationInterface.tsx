import { JobServer } from "@/app/types";
import AnnotatorProvider, { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import QuestionTask from "./QuestionTask";
import { ReactNode, useEffect, useRef } from "react";
import ResponsiveButtonGroup from "../ui/ResponsiveButtonGroup";
import Finished from "./Finished";
import { useHeight } from "@/hooks/useHeight";
import { Loading } from "../ui/loader";
import { DarkModeButton } from "@/hooks/useDarkMode";
import Navigation from "./Navigation";

interface Props {
  jobServer: JobServer;
  blockEvents?: boolean;
  height?: number;
}

export function AnnotationInterface({ jobServer, blockEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useHeight(ref, []);

  return (
    <AnnotatorProvider jobServer={jobServer} height={height}>
      <div ref={ref} className="relative grid h-full w-full grid-rows-[min-content,1fr]">
        <AnnotationMenu />
        <AnnotationUnit jobServer={jobServer} blockEvents={blockEvents} />
      </div>
    </AnnotatorProvider>
  );
}

function AnnotationMenu() {
  return (
    <div className="z-50 bg-primary text-primary-foreground">
      <div className="z-50 flex h-14 items-center justify-between gap-2">
        <Navigation />
        <div className="flex-1 px-3">
          {/* <ResponsiveButtonGroup>
          <DarkModeButton />
        </ResponsiveButtonGroup> */}
        </div>
      </div>
    </div>
  );
}

function AnnotationUnit({ blockEvents, jobServer }: { blockEvents?: boolean; jobServer: JobServer }) {
  const { error, progress, finished } = useUnit();
  if (error)
    return (
      <div className="flex justify-center">
        <div className="mt-20 h-min rounded border-2 border-destructive p-3">{error}</div>
      </div>
    );
  if (finished) return <Finished jobServer={jobServer} />;
  return <QuestionTask blockEvents={blockEvents} />;
}
