import { useState, useEffect } from "react";

import styled from "styled-components";
import { FaStepForward, FaStepBackward } from "react-icons/fa";
import { ChevronLeft, ChevronLeftCircle, ChevronRight, ChevronRightCircle, StepBack, StepForward } from "lucide-react";
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

  const [canSelect, setCanSelect] = useState<boolean[]>([]);

  useEffect(() => {
    const cs = Array(variableStatuses.length).fill(false);
    variableStatuses.forEach((status, i) => {
      if (status === "done") cs[i] = true;
      if (i > 0 && variableStatuses[i - 1] === "done") cs[i] = true;
    });
    setCanSelect(cs);
  }, [variableStatuses]);

  const previousIndex = getPreviousIndex(variableIndex, canSelect);
  const nextIndex = getNextIndex(variableIndex, canSelect);

  // hide if only 1 question that is not yet done
  const hide = variables.length === 1;

  return (
    <div className="flex h-full w-full items-start justify-between gap-1">
      <Button
        size="icon"
        variant="ghost"
        className={`z-30 mt-[2px] flex text-inherit opacity-60 hover:bg-transparent disabled:opacity-0 ${hide ? "invisible" : ""}`}
        disabled={previousIndex === null}
        onClick={() => previousIndex !== null && setQuestionIndex(previousIndex)}
      >
        <StepBack />
      </Button>
      <div className="w-full py-2">{children}</div>
      <Button
        size="icon"
        variant="ghost"
        className={`z-30 mt-[2px] flex bg-transparent text-inherit opacity-60 hover:bg-transparent disabled:opacity-0 ${hide ? "invisible" : ""}`}
        disabled={nextIndex === null}
        onClick={() => nextIndex !== null && setQuestionIndex(nextIndex)}
      >
        <StepForward />
      </Button>
    </div>
  );
}

function getPreviousIndex(questionIndex: number, canSelect: boolean[]) {
  for (let i = questionIndex - 1; i >= 0; i--) {
    if (!canSelect?.[i]) continue;
    return i;
  }
  return null;
}
function getNextIndex(questionIndex: number, canSelect: boolean[]) {
  for (let i = questionIndex + 1; i < canSelect.length; i++) {
    if (!canSelect?.[i]) continue;
    return i;
  }
  return null;
}
