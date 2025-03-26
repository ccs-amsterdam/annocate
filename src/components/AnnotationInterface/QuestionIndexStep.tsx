import { useState, useEffect, useMemo } from "react";

import styled from "styled-components";
import { FaStepForward, FaStepBackward } from "react-icons/fa";
import {
  CheckCircle,
  ChevronLeft,
  ChevronLeftCircle,
  ChevronRight,
  ChevronRightCircle,
  Circle,
  Dot,
  StepBack,
  StepForward,
} from "lucide-react";
import { Button } from "../ui/button";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";

interface QuestionIndexStepProps {
  children?: React.ReactNode | React.ReactNode[];
}

export default function QuestionIndexStep({ children }: QuestionIndexStepProps) {
  const { annotationLib, annotationManager } = useUnit();

  const variables = annotationLib.variables;
  const variableStatuses = annotationLib.variableStatuses;
  const variableIndex = annotationLib.variableIndex;
  const setQuestionIndex = (index: number) => annotationManager.setVariableIndex(index);

  const canSelect: boolean[] = useMemo(() => {
    const cs = Array(variableStatuses.length).fill(false);
    variableStatuses.forEach((status, i) => {
      if (status === "done") cs[i] = true;
      if (i > 0 && variableStatuses[i - 1] === "done") cs[i] = true;
    });
    return cs;
  }, [variableStatuses]);

  let validVariable = 0;
  let endReached = false;
  let showAll = true;

  const noneDone = variableStatuses.every((status) => status !== "done") && variableIndex === 0;
  if (!showAll && noneDone) return null;

  return (
    <div className="flex w-full items-center justify-center px-2">
      {variableStatuses.map((status, i) => {
        if (!showAll && status === "skip") return null;
        validVariable++;

        if (!showAll && endReached) return null;
        if (i >= variableIndex && status === "pending") endReached = true;

        let dotStyle = canSelect[i] ? "text-foreground hover:text-secondary hover:scale-150" : "text-foreground/50";
        if (variableIndex === i) dotStyle = "text-primary scale-150";

        return (
          <Button
            key={i}
            variant="ghost"
            size="icon"
            disabled={!canSelect[i]}
            className={`z-30 flex h-6 rounded-none bg-background/80 py-5 hover:bg-background disabled:opacity-100`}
            onClick={() => {
              if (variableIndex === i) return;
              setQuestionIndex(i);
            }}
          >
            <Dot className={`h-10 w-10 ${dotStyle}`} />
          </Button>
        );
      })}
    </div>
  );
}
