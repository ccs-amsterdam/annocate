"use client";
import { AnnotationLibrary, Codebook, ExtendedCodebook, JobServer, RawUnit, Status, Unit } from "@/app/types";
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
  selectUnit: (i?: number) => void;
}

const UnitContext = createContext<UnitContextProps>({
  unit: dummyUnit(),
  codebook: dummyCodebook(),
  index: null,
  annotationLib: dummyAnnotationLib(),
  annotationManager: new AnnotationManager(() => console.log("AnnotationManager not initialized")),
  selectUnit: (i?: number) => console.log(i),
});
export const useUnit = () => useContext(UnitContext);

interface Props {
  jobServer: JobServer;
  children: ReactNode;
}

export default function UnitProvider({ jobServer, children }: Props) {
  const [index, setIndex] = useQueryState("index", {
    parse: (query: string) => parseInt(query) || undefined,
    defaultValue: null,
  });

  const [rawUnit, setRawUnit] = useState<RawUnit | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [annotationLib, setAnnotationLib] = useState<AnnotationLibrary>(dummyAnnotationLib());
  const [annotationManager] = useState<AnnotationManager>(() => new AnnotationManager(setAnnotationLib));

  const { data: codebook } = useQuery({
    queryKey: ["codebook", jobServer, rawUnit?.unit.codebookId, rawUnit?.unit.codebook],
    queryFn: async () => {
      let codebook = rawUnit?.unit?.codebook;
      if (!codebook && rawUnit?.unit.codebookId) {
        codebook = await jobServer.getCodebook(rawUnit?.unit.codebookId);
      }

      if (!codebook) {
        console.error("Codebook not found");
        toast.error("Codebook not found");
        return dummyCodebook();
      }
      return importCodebook(codebook);
    },
    cacheTime: Infinity,
    staleTime: Infinity,
  });

  useEffect(() => {
    jobServer.getUnit().then(setRawUnit);
  }, [jobServer]);

  useEffect(() => {
    if (!rawUnit || !codebook) return;
    const unit = prepareUnit(rawUnit, codebook);
    setIndex(rawUnit.index);
    setUnit(unit);
    annotationManager.createAnnotationLibrary(jobServer, unit, codebook);
  }, [annotationManager, jobServer, rawUnit, codebook, setIndex]);

  const selectUnit = useCallback(
    async (i?: number) => {
      setRawUnit((await jobServer.getUnit(i)) || null);
    },
    [jobServer],
  );

  return (
    <UnitContext.Provider
      value={{
        unit: unit || dummyUnit(),
        codebook: codebook || dummyCodebook(),
        index,
        annotationLib,
        annotationManager,
        selectUnit,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

function dummyCodebook(): ExtendedCodebook {
  return {
    variables: [],
    settings: {},
  };
}

function dummyUnit(): Unit {
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

function dummyAnnotationLib(): AnnotationLibrary {
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
