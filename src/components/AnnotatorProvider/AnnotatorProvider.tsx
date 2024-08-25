"use client";
import { AnnotationLibrary, Codebook, ExtendedCodebook, ExtendedUnit, GetUnit, JobServer, Progress } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "next-usequerystate";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  annotationManager: new AnnotationManager(),
  annotationLib: new AnnotationManager().annotationLib,
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
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
  error: string | undefined;
}

type CodebookCache = Record<number, { modified?: Date; codebook: ExtendedCodebook }>;

export default function AnnotatorProvider({ jobServer, height, children }: Props) {
  const [unitBundle, setUnitBundle] = useState<UnitBundle | null>(null);
  const codebookCache = useRef<CodebookCache>({});

  const sandboxData = useMemo(() => {
    return {
      unit: { test: "dit" },
    };
  }, [unitBundle]);
  const { evalStringTemplate, ready } = useSandboxedEval(sandboxData);

  const selectUnit = useCallback(
    async (i?: number) => {
      const getUnit = await jobServer.getUnit(i);
      if (!getUnit.unit) return;

      let codebook: ExtendedCodebook;
      if (getUnit.unit.codebook_id !== undefined) {
        const inCache = codebookCache.current[getUnit.unit.codebook_id];
        if (!inCache || inCache.modified !== getUnit.unit.codebook_modified) {
          const { codebook, error } = await jobServer.getCodebook(getUnit.unit.codebook_id);
          if (!codebook) {
            toast.error(error);
            setUnitBundle(null);
            return;
          }
          codebookCache.current[getUnit.unit.codebook_id] = {
            modified: getUnit.unit.codebook_modified,
            codebook: importCodebook(codebook),
          };
        }
        codebook = codebookCache.current[getUnit.unit.codebook_id].codebook;
      } else {
        if (!getUnit.unit.codebook) {
          toast.error("Error: unit is missing a codebook");
          setUnitBundle(null);
          return;
        }
        codebook = importCodebook(getUnit.unit.codebook);
      }

      setUnitBundle(createUnitBundle(jobServer, getUnit, codebook, setUnitBundle));
    },
    [jobServer, codebookCache],
  );

  useEffect(() => {
    codebookCache.current = {};
    selectUnit();
  }, [jobServer, codebookCache, selectUnit]);

  if (!unitBundle) return null;

  return (
    <UnitContext.Provider
      value={{
        unit: unitBundle.unit,
        codebook: unitBundle.codebook,
        annotationLib: unitBundle.annotationLib,
        annotationManager: unitBundle.annotationManager,
        progress: unitBundle.progress,
        error: unitBundle.error,
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
