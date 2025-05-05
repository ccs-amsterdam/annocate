"use client";
import { AnnotationLibrary, CodebookNode, CodebookPhase, JobServer, JobUnitState, Progress, Unit } from "@/app/types";
import AnnotationManager from "@/classes/AnnotationManager";
import { prepareCodebook } from "@/functions/treeFunctions";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

interface ContextProps {
  jobState?: JobUnitState;
  unit?: Unit | null;
  codebook?: CodebookPhase;
  annotationLib?: AnnotationLibrary;
  annotationManager?: AnnotationManager;
  progress?: Progress;
  error: string | undefined;
  height: number;
  finished?: boolean;
}

interface InitializedContextProps extends ContextProps {
  jobState: JobUnitState;
  unit: Unit | null;
  codebook: CodebookPhase;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
}

const UnitContext = createContext<ContextProps>({
  error: undefined,
  height: 0,
  finished: false,
});

function isInitialized(props: ContextProps): boolean {
  return !!props.jobState && !!props.unit && !!props.codebook && !!props.annotationLib && !!props.annotationManager;
}

export function useUnit(): InitializedContextProps {
  const context = useContext(UnitContext);
  // Here we need to tell ts that we are sure that the context is initialized.
  // (this is the only way to avoid having to non-null assert every time we use the context)
  if (!isInitialized(context)) throw new Error("useUnit must be used within an initialized AnnotatorProvider");
  return context as InitializedContextProps;
}

interface Props {
  jobServer: JobServer;
  height: number;
  children: ReactNode;
}

export interface PhaseState {
  codebook: CodebookPhase;
  unit: Unit | null;
  annotationLib: AnnotationLibrary;
  progress: Progress;
  error: string | undefined;
}

export default function AnnotatorProvider({ jobServer, height, children }: Props) {
  const [finished, setFinished] = useState(false);
  const [unitBundle, setUnitBundle] = useState<PhaseState | null>(null);
  const [annotationManager, setAnnotationManager] = useState<AnnotationManager | undefined>(undefined);

  useEffect(() => {
    jobServer.getJobState().then(({ sessionToken, codebook, progress, globalAnnotations }) => {
      const annotationManager = new AnnotationManager({
        jobServer,
        setUnitBundle,
        sessionToken,
        codebook: prepareCodebook(codebook),
        progress,
        globalAnnotations,
      });
      setAnnotationManager(annotationManager);
      annotationManager.navigate();
    });
  }, [jobServer]);

  const context: ContextProps = {
    unit: unitBundle?.unit,
    codebook: unitBundle?.codebook,
    annotationLib: unitBundle?.annotationLib,
    annotationManager,
    progress: unitBundle?.progress,
    error: unitBundle?.error,
    height,
    finished,
  };
  if (!isInitialized(context)) return null;

  return <UnitContext.Provider value={context}>{children}</UnitContext.Provider>;
}
