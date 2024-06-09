"use client";
import { AnnotationLibrary, Codebook, ExtendedCodebook, JobServer, Progress, RawUnit, Status, Unit } from "@/app/types";
import AnnotationManager, { createAnnotationLibrary } from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { prepareUnit } from "@/functions/processUnitContent";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "next-usequerystate";
import { g } from "next-usequerystate/dist/serializer-C_l8WgvO";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface UnitContextProps {
  unit: Unit;
  codebook: Codebook;
  index: number | null;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  progress: Progress;
  selectUnit: (i?: number) => void;
}

const UnitContext = createContext<UnitContextProps>({
  unit: initUnit(),
  codebook: initCodebook(),
  index: null,
  annotationLib: initAnnotationLib(),
  annotationManager: new AnnotationManager(() => console.log("AnnotationManager not initialized")),
  progress: initProgress(),
  selectUnit: (i?: number) => console.log(i),
});
export const useUnit = () => useContext(UnitContext);

interface Props {
  jobServer: JobServer;
  children: ReactNode;
}

export default function UnitProvider({ jobServer, children }: Props) {
  const [index, setIndex] = useQueryState("unit", {
    parse: (query: string) => parseInt(query) || undefined,
    defaultValue: null,
  });

  const [rawUnit, setRawUnit] = useState<RawUnit | null>(null);
  const [progress, setProgress] = useState<Progress>(initProgress());
  const [unit, setUnit] = useState<Unit | null>(null);
  const [annotationLib, setAnnotationLib] = useState<AnnotationLibrary>(initAnnotationLib());
  const [annotationManager] = useState<AnnotationManager>(() => new AnnotationManager(setAnnotationLib));

  const { data: codebook } = useQuery({
    queryKey: ["codebook", jobServer.id, rawUnit?.unit.codebookId, rawUnit?.unit.codebook],
    queryFn: async () => {
      let codebook = rawUnit?.unit?.codebook;
      if (!codebook && rawUnit?.unit.codebookId) {
        codebook = await jobServer.getCodebook(rawUnit?.unit.codebookId);
      }

      if (!codebook) {
        console.error("Codebook not found");
        toast.error("Codebook not found");
        return initCodebook();
      }
      return importCodebook(codebook);
    },
    cacheTime: Infinity,
    staleTime: Infinity,
  });

  useEffect(() => {
    jobServer.getUnit().then(({ unit, progress }) => {
      setRawUnit(unit);
      setProgress(progress);
    });
  }, [jobServer]);

  useEffect(() => {
    console.log("me");
  }, [codebook]);

  useEffect(() => {
    if (!rawUnit || !codebook) return;
    const unit = prepareUnit(rawUnit, codebook);
    setIndex(rawUnit.index);
    setUnit(unit);
    annotationManager.initAnnotationLibrary(jobServer, unit, codebook);
  }, [annotationManager, jobServer, rawUnit, codebook, setIndex]);

  const selectUnit = useCallback(
    async (i?: number) => {
      console.log("select", i);
      const { unit, progress } = await jobServer.getUnit(i);
      setRawUnit(unit);
      setProgress(progress);
    },
    [jobServer],
  );

  return (
    <UnitContext.Provider
      value={{
        unit: unit || initUnit(),
        codebook: codebook || initCodebook(),
        index,
        progress,
        annotationLib,
        annotationManager,
        selectUnit,
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

function initCodebook(): ExtendedCodebook {
  return {
    variables: [],
    settings: {},
  };
}

function initUnit(): Unit {
  return {
    unitId: "",
    unitType: "code",
    status: "IN_PROGRESS",
    unit: {
      codebook: {
        settings: {},
        variables: [],
      },
    },
  };
}

function initAnnotationLib(): AnnotationLibrary {
  return {
    type: "code",
    status: "IN_PROGRESS",
    conditionals: [],
    conditionReport: null,
    annotations: {},
    byToken: {},
    codeHistory: {},
    unitId: "",
    variables: [],
    variableIndex: 0,
    variableStatuses: [],
    previousIndex: 0,
  };
}
