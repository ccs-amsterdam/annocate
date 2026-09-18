"use client";
import {
  AnnotationLibrary,
  JobManagerState,
  GetSession,
  JobServer,
  Layouts,
  ProgressState,
  Unit,
  VariableMap,
  JobContext,
} from "@/app/types";
import JobManager, { createJobManager } from "@/classes/JobManager";
import { prepareCodebook } from "@/functions/treeFunctions";
import { useSandbox } from "@/hooks/useSandboxedEval";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

type ContextProps = {
  jobManager: JobManager | null;
  jobManagerState: JobManagerState | null;
  error: string | null;
  height: number;
  finished: boolean;
};

const Context = createContext<ContextProps>({
  jobManager: null,
  jobManagerState: null,
  error: null,
  height: 0,
  finished: false,
});

function asJobContext(props: ContextProps): JobContext | null {
  if (!props.jobManager || !props.jobManagerState) return null;
  return {
    unit: props.jobManagerState.unit,
    progress: props.jobManagerState.progress,
    variableMap: props.jobManagerState.variableMap,
    annotationLib: props.jobManagerState.annotationLib,
    jobManager: props.jobManager,
    contents: props.jobManagerState.contents,
    error: props.error,
    height: props.height,
    finished: props.finished,
  };
}

export function useJobContext(): JobContext {
  const context = useContext(Context);
  const jobContext = asJobContext(context);
  if (!jobContext) throw new Error("useJobContext must be used within an initialized JobContextProvider");
  return jobContext;
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
  const [jobManagerState, setJobManagerState] = useState<JobManagerState | null>(null);
  const [jobManager, setJobManager] = useState<JobManager | null>(null);
  const sandbox = useSandbox();

  useEffect(() => {
    createJobManager(jobServer, setJobManagerState, sandbox).then((jobManager) => {
      setJobManager(jobManager);
      jobManager.navigate();
    });
  }, [jobServer, sandbox]);

  const context: ContextProps = {
    jobManager: jobManager,
    jobManagerState,
    error: jobManagerState?.error ?? null,
    height,
    finished,
  };

  // this prevents rendering the components that use useJobContext before it's initialied (which would throw an error)
  // this seems the only way to prevent having to typeguard everywhere
  const jobContext = asJobContext(context);
  if (!jobContext) return null;

  return <Context.Provider value={context}>{children}</Context.Provider>;
}
