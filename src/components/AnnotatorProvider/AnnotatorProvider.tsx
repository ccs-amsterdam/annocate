"use client";
import { AnnotationLibrary, Codebook, ExtendedCodebook, ExtendedUnit, GetUnit, JobServer, Progress } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "next-usequerystate";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createUnitBundle } from "./createUnitBundle";
import { useSandboxedEval } from "@/hooks/useSandboxedEval";

interface UnitContextProps {
  unit: ExtendedUnit;
  codebook: ExtendedCodebook;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
  error: string | undefined;
  height: number;
  selectUnit: (i?: number) => void;
  initialising: boolean;
  evalStringTemplate: (str: string) => Promise<string>;
}

const UnitContext = createContext<UnitContextProps>({
  unit: initUnit(),
  codebook: importCodebook(initCodebook()),
  annotationLib: initAnnotationLib(),
  annotationManager: new AnnotationManager(() => console.log("AnnotationManager not initialized")),
  progress: initProgress(),
  error: undefined,
  height: 0,
  selectUnit: (i?: number) => console.log(i),
  initialising: true,
  evalStringTemplate: async (str: string) => str,
});
export const useUnit = () => useContext(UnitContext);

interface Props {
  jobServer: JobServer;
  height: number;
  children: ReactNode;
}

export interface UnitBundle {
  unit: ExtendedUnit;
  codebook: ExtendedCodebook;
}

export default function AnnotatorProvider({ jobServer, height, children }: Props) {
  const [getUnit, setGetUnit] = useState<GetUnit>({
    unit: null,
    progress: initProgress(),
    error: "",
  });
  const [unitBundle, setUnitBundle] = useState<UnitBundle>(() => ({
    unit: initUnit(),
    codebook: importCodebook(initCodebook()),
  }));
  const [annotationLib, setAnnotationLib] = useState<AnnotationLibrary>(initAnnotationLib());
  const [annotationManager] = useState<AnnotationManager>(() => new AnnotationManager(setAnnotationLib));

  const sandboxData = useMemo(() => {
    return {
      unit: { test: "dit" },
    };
  }, [unitBundle, annotationLib]);
  const { evalStringTemplate, ready } = useSandboxedEval(sandboxData);

  const { data: codebookWithId, isLoading: codebookLoading } = useQuery({
    queryKey: ["codebook", jobServer.sessionId, getUnit.unit?.codebook_id],
    queryFn: async () => {
      if (getUnit.unit?.codebook_id === undefined) return null;
      let codebook = await jobServer.getCodebook(getUnit.unit?.codebook_id);
      if (!codebook) {
        console.error("Codebook not found");
        toast.error("Codebook not found");
        codebook = initCodebook();
      }
      return { id: getUnit.unit.codebook_id, codebook: importCodebook(codebook) };
    },
    enabled: getUnit.unit?.codebook_id !== undefined,
    cacheTime: Infinity,
    staleTime: Infinity,
  });

  useEffect(() => {
    jobServer.getUnit().then(setGetUnit);
  }, [jobServer]);

  useEffect(() => {
    if (!getUnit.unit) return;

    let codebook: ExtendedCodebook;
    if (getUnit.unit.codebook_id !== undefined) {
      if (codebookLoading) return;
      if (getUnit.unit.codebook_id !== codebookWithId?.id) {
        return;
      }
      codebook = codebookWithId?.codebook;
    } else {
      codebook = importCodebook(getUnit.unit.codebook || initCodebook());
    }

    const unitBundle = createUnitBundle(getUnit.unit, codebook);
    setUnitBundle(unitBundle);
    annotationManager.initAnnotationLibrary(jobServer, unitBundle.unit, unitBundle.codebook);
  }, [annotationManager, jobServer, getUnit, codebookWithId, codebookLoading]);

  const selectUnit = useCallback(
    async (i?: number) => {
      jobServer.getUnit(i).then(setGetUnit);
    },
    [jobServer],
  );

  return (
    <UnitContext.Provider
      value={{
        unit: unitBundle.unit,
        codebook: unitBundle.codebook,
        progress: getUnit.progress,
        error: getUnit.error,
        annotationLib,
        annotationManager,
        height,
        selectUnit,
        initialising: !ready,
        evalStringTemplate,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

function initProgress(): Progress {
  return {
    currentUnit: 0,
    currentVariable: 0,
    nTotal: 0,
    nCoded: 0,
    seekBackwards: false,
    seekForwards: false,
  };
}

function initCodebook(): Codebook {
  return {
    type: "annotation",
    unit: {
      fields: [],
      meta: [],
    },
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
    settings: {},
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
