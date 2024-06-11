"use client";
import { AnnotationLibrary, Codebook, ExtendedCodebook, ExtendedUnit, GetUnit, JobServer, Progress } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "next-usequerystate";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { createUnitBundle } from "./createUnitBundle";

interface UnitContextProps {
  unit: ExtendedUnit;
  codebook: ExtendedCodebook;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
  height: number;
  selectUnit: (i?: number) => void;
  initialising: boolean;
}

const UnitContext = createContext<UnitContextProps>({
  unit: initUnit(),
  codebook: importCodebook(initCodebook()),
  annotationLib: initAnnotationLib(),
  annotationManager: new AnnotationManager(() => console.log("AnnotationManager not initialized")),
  progress: initProgress(),
  height: 0,
  selectUnit: (i?: number) => console.log(i),
  initialising: true,
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
  const [index, setIndex] = useQueryState("unit", {
    parse: (query: string) => parseInt(query) || undefined,
    defaultValue: null,
  });

  const [getUnit, setGetUnit] = useState<GetUnit>({
    unit: null,
    progress: initProgress(),
  });
  const [unitBundle, setUnitBundle] = useState<UnitBundle>(() => ({
    unit: initUnit(),
    codebook: importCodebook(initCodebook()),
  }));
  const [annotationLib, setAnnotationLib] = useState<AnnotationLibrary>(initAnnotationLib());
  const [annotationManager] = useState<AnnotationManager>(() => new AnnotationManager(setAnnotationLib));

  const { data: codebookWithId, isLoading: codebookLoading } = useQuery({
    queryKey: ["codebook", jobServer.id, getUnit.unit?.codebook_id],
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
    setIndex(getUnit.progress.current);
    setUnitBundle(unitBundle);
    annotationManager.initAnnotationLibrary(jobServer, unitBundle.unit, unitBundle.codebook);
  }, [annotationManager, jobServer, getUnit, codebookWithId, codebookLoading, setIndex]);

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
        annotationLib,
        annotationManager,
        height,
        selectUnit,
        initialising: false,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

function initProgress(): Progress {
  return {
    current: 0,
    n_total: 0,
    n_coded: 0,
    seek_backwards: false,
    seek_forwards: false,
  };
}

function initCodebook(): Codebook {
  return {
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
    type: "code",
    status: "IN_PROGRESS",
    content: { grid: { areas: "" } },
    annotations: [],
    codebook: {
      settings: {},
      variables: [],
    },
  };
}

function initAnnotationLib(): AnnotationLibrary {
  return {
    type: "code",
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
