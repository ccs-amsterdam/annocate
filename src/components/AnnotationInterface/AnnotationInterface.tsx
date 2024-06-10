import { JobServer } from "@/app/types";
import AnnotatorProvider, { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import QuestionTask from "./QuestionTask";
import { ReactNode, useRef } from "react";
import ResponsiveButtonGroup from "../ui/ResponsiveButtonGroup";
import { DarkModeButton } from "../Common/Theme";
import IndexController from "./IndexController";
import Finished from "./Finished";
import { useHeight } from "@/hooks/useHeight";

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
      <div ref={ref} className="relative grid h-full grid-rows-[min-content,1fr]">
        <AnnotationMenu />
        <AnnotationUnit jobServer={jobServer} blockEvents={blockEvents} />
      </div>
    </AnnotatorProvider>
  );
}

function AnnotationMenu() {
  const { selectUnit, progress, codebook } = useUnit();
  return (
    <div className="z-20 flex items-center justify-between gap-2 border-b border-foreground bg-gradient-to-b from-primary-dark to-primary px-3 py-2 text-primary-foreground">
      <IndexController
        n={progress.n_total}
        progressN={progress.n_coded}
        index={progress.current}
        setIndex={selectUnit}
        canGoBack={!!progress.seek_backwards}
        canGoForward={!!progress.seek_forwards}
      />
      <div>
        <ResponsiveButtonGroup>
          <DarkModeButton />
        </ResponsiveButtonGroup>
      </div>
    </div>
  );
}

function AnnotationUnit({ blockEvents, jobServer }: { blockEvents?: boolean; jobServer: JobServer }) {
  const { progress } = useUnit();
  if (progress.current >= progress.n_total) return <Finished jobServer={jobServer} />;
  return <QuestionTask blockEvents={blockEvents} />;
}
