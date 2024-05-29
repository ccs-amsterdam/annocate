"use client";
import { AnnotationLibrary, Codebook, ExtendedCodebook, JobServer, RawUnit, Status, Unit } from "@/app/types";
import AnnotationManager, { createAnnotationLibrary } from "@/functions/AnnotationManager";
import { importCodebook } from "@/functions/codebook";
import { prepareUnit } from "@/functions/processUnitContent";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "next-usequerystate";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface UnitContextProps {
  unit: Unit;
  postAnnotations: (status: Status) => void;
  codebook: Codebook;
  index: number | null;
  selectUnit: (i?: number) => void;
}

interface AnnotationsContextProps {
  annotations: AnnotationLibrary;
  annotationManager: AnnotationManager;
}

const UnitContext = createContext<UnitContextProps>({
  unit: dummyUnit(),
  postAnnotations: (status: Status) => console.log(status),
  codebook: dummyCodebook(),
  index: null,
  selectUnit: (i?: number) => console.log(i),
});
export const useUnit = () => useContext(UnitContext);

const AnnotationsContext = createContext<AnnotationsContextProps>({
  annotations: dummyAnnotationLib(),
  annotationManager: new AnnotationManager(() => console.log("AnnotationManager not initialized")),
});
export const useAnnotations = () => useContext(AnnotationsContext);

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
    queryKey: ["codebook", jobServer, rawUnit?.unit.codebook, rawUnit?.unit.codebookId],
    queryFn: async () => {
      const codebook = rawUnit?.unit?.codebookId
        ? await jobServer?.getCodebook(rawUnit?.unit.codebookId)
        : rawUnit?.unit.codebook;
      if (!codebook) {
        console.error("Codebook not found");
        toast.error("Codebook not found");
        return dummyCodebook();
      }
      return importCodebook(codebook);
    },
  });

  useEffect(() => {
    jobServer.getUnit().then(setRawUnit);
  }, [jobServer]);

  useEffect(() => {
    if (!rawUnit || !codebook) return;
    const unit = prepareUnit(rawUnit, codebook);
    setIndex(rawUnit.index);
    setUnit(unit);
    setAnnotationLib(createAnnotationLibrary(unit, codebook, unit.unit.annotations || []));
  }, [rawUnit, codebook, setIndex]);

  const selectUnit = useCallback(
    async (i?: number) => {
      setRawUnit((await jobServer.getUnit(i)) || null);
    },
    [jobServer],
  );

  const postAnnotations = useCallback(
    (status: Status) => {
      if (!unit || !annotationLib) {
        console.error("Unit or annotationLib not found");
        return;
      }
      if (unit.unitId !== annotationLib.unitId) {
        console.error("Unit and annotationLib do not match");
        return;
      }
      jobServer.postAnnotations(unit.unitId, Object.values(annotationLib.annotations), status);
    },
    [unit, annotationLib, jobServer],
  );

  return (
    <UnitContext.Provider
      value={{
        unit: unit || dummyUnit(),
        postAnnotations,
        codebook: codebook || dummyCodebook(),
        index,
        selectUnit,
      }}
    >
      <AnnotationsContext.Provider value={{ annotations: annotationLib, annotationManager }}>
        {children}
      </AnnotationsContext.Provider>
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
  };
}
