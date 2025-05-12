"use client";
import {
  AnnotationLibrary,
  CodebookState,
  GetSession,
  JobServer,
  Layouts,
  ProgressState,
  Unit,
  VariableMap,
} from "@/app/types";
import AnnotationManager, { createAnnotationManager } from "@/classes/AnnotationManager";
import { prepareCodebook } from "@/functions/treeFunctions";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

interface ContextProps {
  unit?: Unit | null;
  variableMap?: VariableMap;
  annotationLib?: AnnotationLibrary;
  annotationManager?: AnnotationManager;
  progress?: ProgressState;
  layouts?: Layouts;
  error: string | undefined;
  height: number;
  finished?: boolean;
}

export interface JobContext extends ContextProps {
  unit: Unit | null;
  progress: ProgressState;
  variableMap: VariableMap;
  layouts: Layouts;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
}

const JobContext = createContext<ContextProps>({
  error: undefined,
  height: 0,
  finished: false,
});

function isInitialized(props: ContextProps): boolean {
  return !!props.progress && !!props.variableMap && !!props.annotationLib && !!props.annotationManager;
}

export function useJobContext(): JobContext {
  const context = useContext(JobContext);
  // Here we need to tell ts that we are sure that the context is initialized.
  // (this is the only way to avoid having to non-null assert every time we use the context)
  if (!isInitialized(context)) throw new Error("useUnit must be used within an initialized AnnotatorProvider");
  return context as JobContext;
}

interface Props {
  jobServer: JobServer;
  height: number;
  children: ReactNode;
}

export interface PhaseState {
  variableMap: VariableMap;
  unit: Unit | null;
  annotationLib: AnnotationLibrary;
  progress: ProgressState;
  layouts: Layouts;
  error: string | undefined;
}

export default function AnnotatorProvider({ jobServer, height, children }: Props) {
  const [finished, setFinished] = useState(false);
  const [unitBundle, setUnitBundle] = useState<PhaseState | null>(null);
  const [annotationManager, setAnnotationManager] = useState<AnnotationManager | undefined>(undefined);

  useEffect(() => {
    createAnnotationManager(jobServer, setUnitBundle).then((annotationManager) => {
      setAnnotationManager(annotationManager);
      annotationManager.navigate();
    });
  }, [jobServer]);

  const context: ContextProps = {
    unit: unitBundle?.unit,
    variableMap: unitBundle?.variableMap,
    annotationLib: unitBundle?.annotationLib,
    annotationManager,
    progress: unitBundle?.progress,
    error: unitBundle?.error,
    height,
    finished,
  };

  if (!isInitialized(context)) return null;

  return <JobContext.Provider value={context}>{children}</JobContext.Provider>;
}
