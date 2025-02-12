"use client";
import {
  AnnotationLibrary,
  Codebook,
  ExtendedCodebook,
  ExtendedUnit,
  GetJobState,
  GetUnit,
  JobServer,
  Progress,
  Unit,
} from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createUnitBundle } from "./unitProcessing";
import useWatchChange from "@/hooks/useWatchChange";

interface UnitContextProps {
  jobState: GetJobState;
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
  const [jobState, setJobState] = useState<GetJobState>(initJobState);

  const selectUnit = useCallback(
    async (phaseNumber?: number, unitIndex?: number) => {
      if (!jobServer.initialized) await jobServer.init(setJobState);

      const getUnit = await jobServer.getUnit(phaseNumber, unitIndex);

      if (getUnit === null) {
        setFinished(true);
        return;
      }

      // if (getUnit.progress.phase >= getUnit.progress.phases.length) {
      //   setFinished(true);
      //   return;
      // }

      const codebook = await jobServer.getCodebook(getUnit.progress.phase);
      const extendedCodebook = importCodebook(codebook);
      setUnitBundle(createUnitBundle(jobServer, getUnit, extendedCodebook, setUnitBundle));
    },
    [jobServer, setFinished, setJobState],
  );

  const finishUnit = useCallback(() => {
    if (!unitBundle) return;
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
  }, [selectUnit, unitBundle]);

  useEffect(() => {
    selectUnit();
  }, [jobServer, selectUnit]);

  if (!jobServer.initialized || !unitBundle) return null;

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

function initJobState(): GetJobState {
  return {
    surveyAnnotations: {},
    unitAnnotations: {},
  };
}

function initProgress(): Progress {
  return {
    phase: 0,
    phases: [{ type: "survey" }],
  };
}

function initCodebook(): Codebook {
  return {
    type: "annotationPhase",
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

function initUnit(): ExtendedUnit {
  return {
    token: "",
    type: "annotation",
    status: "IN_PROGRESS",
    content: { grid: { areas: "" } },
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
