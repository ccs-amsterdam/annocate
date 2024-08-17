import { useState, useEffect } from "react";
import { Answer, SetState, Variable, VariableStatus } from "@/app/types";

import styled from "styled-components";
import { FaStepForward, FaStepBackward } from "react-icons/fa";
import { ChevronLeft, ChevronLeftCircle, ChevronRight, ChevronRightCircle } from "lucide-react";
import { Button } from "../ui/button";

interface QuestionIndexStepProps {
  children?: React.ReactNode | React.ReactNode[];
  variables: Variable[];
  variableIndex: number;
  variableStatuses: VariableStatus[];
  setQuestionIndex: (index: number) => void;
}

export default function QuestionIndexStep({
  children,
  variables,
  variableIndex,
  variableStatuses,
  setQuestionIndex,
}: QuestionIndexStepProps) {
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
    <div className="relative flex h-full min-h-6 w-full  justify-between gap-2  ">
      <Button
        size="icon"
        variant="ghost"
        className={` absolute left-0 z-30 flex h-12 w-9 items-start pt-[10px] text-primary-foreground/60  hover:bg-transparent disabled:opacity-0 ${hide ? "invisible" : ""}`}
        disabled={previousIndex === null}
        onClick={() => previousIndex !== null && setQuestionIndex(previousIndex)}
      >
        <ChevronLeftCircle />
      </Button>
      {children}
      <Button
        size="icon"
        variant="ghost"
        className={`absolute right-0 z-30 flex h-12 w-9 items-start bg-transparent pt-[10px]
          text-primary-foreground/60 hover:bg-transparent  disabled:opacity-0 ${hide ? "invisible" : ""}`}
        disabled={nextIndex === null}
        onClick={() => nextIndex !== null && setQuestionIndex(nextIndex)}
      >
        <ChevronRightCircle />
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
