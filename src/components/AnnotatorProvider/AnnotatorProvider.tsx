"use client";
import { AnnotationLibrary, CodebookPhase, ExtendedCodebook, JobServer, JobState, Progress, Unit } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createUnitBundle } from "./unitProcessing";

interface UnitContextProps {
  jobState: JobState;
  unit: Unit;
  codebook: ExtendedCodebook;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
  error: string | undefined;
  height: number;
  selectUnit: (phaseNumber?: number, unitIndex?: number) => void;
  finishUnit: () => void;
  finished?: boolean;
}

const UnitContext = createContext<UnitContextProps>({
  jobState: initJobState(),
  unit: initUnit(),
  codebook: importCodebook(initCodebook()),
  annotationManager: new AnnotationManager(),
  annotationLib: new AnnotationManager().annotationLib,
  progress: initProgress(),
  error: undefined,
  height: 0,
  selectUnit: (i?: number) => console.log(i),
  finishUnit: () => console.log("finishUnit"),
  finished: false,
});
export const useUnit = () => useContext(UnitContext);

interface Props {
  jobServer: JobServer;
  height: number;
  children: ReactNode;
}

export interface UnitBundle {
  unit: Unit;
  codebook: ExtendedCodebook;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
  error: string | undefined;
}

export default function AnnotatorProvider({ jobServer, height, children }: Props) {
  const [finished, setFinished] = useState(false);
  const [unitBundle, setUnitBundle] = useState<UnitBundle | null>(null);
  const [jobState, setJobState] = useState<JobState>(initJobState);

  const selectUnit = useCallback(
    async (phaseNumber?: number, unitIndex?: number, variableIndex?: number) => {
      if (!jobServer.initialized) await jobServer.init(setJobState);

      const getUnit = await jobServer.getUnit(phaseNumber, unitIndex);

      if (getUnit === null) {
        setFinished(true);
        return;
      } else {
        setFinished(false);
      }

      const rawCodebook = await jobServer.getCodebook(getUnit.progress.phase);
      const codebook = importCodebook(rawCodebook);
      setUnitBundle(createUnitBundle({ jobServer, getUnit, codebook, setUnitBundle, variableIndex }));
    },
    [jobServer, setFinished, setJobState],
  );

  const finishUnit = useCallback(() => {
    if (jobServer.previewMode) {
      return previewToast(unitBundle);
    }

    if (!unitBundle) return null;
    const { progress } = unitBundle;
    const phase = progress.phases[progress.phase];

    // If we are in a survey phase, we just move to the next phase
    if (phase.type === "survey") {
      selectUnit(progress.phase + 1);
      return;
    }

    // If we are in an annotation phase, we move to the next unit,
    // or the next phase if we are at the last unit
    if (phase.type === "annotation") {
      if (phase.currentUnit + 1 >= phase.nTotal) {
        selectUnit(progress.phase + 1);
      } else {
        selectUnit(progress.phase, phase.currentUnit + 1);
      }
    }
  }, [jobServer, selectUnit, unitBundle]);

  useEffect(() => {
    selectUnit();
    setFinished(false);
  }, [jobServer, selectUnit]);

  // if (!jobServer.initialized || !unitBundle) return null;
  if (!unitBundle) return null;

  return (
    <UnitContext.Provider
      value={{
        jobState,
        unit: unitBundle.unit,
        codebook: unitBundle.codebook,
        annotationLib: unitBundle.annotationLib,
        annotationManager: unitBundle.annotationManager,
        progress: unitBundle.progress,
        error: unitBundle.error,
        height,
        selectUnit,
        finishUnit,
        finished,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

// We initialize a bunch of stuff instead of starting with nulls, because
// this avoids a lot of null checks in the code.

function initJobState(): JobState {
  return {
    annotations: {},
    unitData: {},
  };
}

function initProgress(): Progress {
  return {
    phase: 0,
    phases: [{ type: "survey", label: "" }],
    phasesCoded: 0,
  };
}

function initCodebook(): CodebookPhase {
  return {
    type: "survey",
    variables: [
      {
        name: "missing",
        type: "select code",
        multiple: false,
        vertical: false,
        question: "Error: codebook is missing",
        codes: [{ code: "continue" }],
      },
    ],
  };
}

function initUnit(): Unit {
  return {
    token: "",
    type: "annotation",
    status: "IN_PROGRESS",
    data: {},
    annotations: [],
  };
}

function initAnnotationLib(): AnnotationLibrary {
  return {
    sessionId: "initializing",
    type: "annotation",
    status: "IN_PROGRESS",
    annotations: {},
    byToken: {},
    codeHistory: {},
    variables: [],
    variableIndex: 0,
    variableStatuses: [],
    previousIndex: 0,
  };
}

function previewToast(unitBundle: UnitBundle | null) {
  if (!unitBundle) {
    return toast("Preview annotation");
  }
  const prettyAnnotation = JSON.stringify(Object.values(unitBundle.annotationLib.annotations), null, 2);
  return toast(
    <div>
      <h4 className={"mb-2 font-bold"}>Preview annotations:</h4>
      <pre>{prettyAnnotation}</pre>
    </div>,
  );
}
