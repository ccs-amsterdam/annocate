import { useState, useEffect, useMemo, useRef } from "react";

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

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const activeButton = container.children[variableIndex] as HTMLElement;

      if (activeButton) {
        const containerWidth = container.offsetWidth;
        const buttonWidth = activeButton.offsetWidth;
        const buttonOffsetLeft = activeButton.offsetLeft;

        const transformValue = containerWidth / 2 - buttonOffsetLeft - buttonWidth / 2;
        console.log(transformValue);
        container.style.transform = `translateX(${transformValue}px)`;
      }
    }
  }, [variableIndex]);

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
  if (variables.length === 1) return null;

  return (
    <div className="relative z-50 mx-3 flex justify-center overflow-hidden bg-background/80 hover:bg-background">
      {/* <div className="absolute top-3 h-4 w-[3px] rounded-lg bg-primary" /> */}
      <div ref={containerRef} className="flex transition-transform duration-200 ease-in-out">
        {variableStatuses.map((status, i) => {
          if (!showAll && status === "skip") return null;
          validVariable++;

          if (!showAll && endReached) return null;
          if (i >= variableIndex && status === "pending") endReached = true;

          let dotStyle = canSelect[i] ? "bg-primary" : "bg-primary/50";
          if (variableIndex === i) dotStyle = "bg-primary-dark";

          let distance = Math.max(0, Math.abs(variableIndex - i) - 2);
          const size = Math.max(35 * Math.exp(-0.3 * distance), 1);

          return (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              disabled={variableIndex === i || !canSelect[i]}
              className={`z-50 flex h-10 items-center rounded-none hover:bg-transparent disabled:opacity-100`}
              style={{ width: size + "px" }}
              onClick={() => {
                if (variableIndex === i) return;
                setQuestionIndex(i);
              }}
            >
              <div
                className={`rounded-full ${dotStyle}`}
                style={{ height: size * 0.24 + "px", width: size * 0.48 + "px" }}
              />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
