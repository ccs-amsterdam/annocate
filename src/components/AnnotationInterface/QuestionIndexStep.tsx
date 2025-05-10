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
import { useJobContext } from "../AnnotatorProvider/AnnotatorProvider";

interface QuestionIndexStepProps {
  children?: React.ReactNode | React.ReactNode[];
}

export default function QuestionIndexStep({ children }: QuestionIndexStepProps) {
  const { progress, annotationManager } = useJobContext();
  const phaseProgress = progress.phases[progress.currentPhase];

  const setQuestionIndex = (index: number) => annotationManager.setVariableIndex(index);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const activeButton = container.children[phaseProgress.currentVariable] as HTMLElement;

      if (activeButton) {
        const containerWidth = container.offsetWidth;
        const buttonWidth = activeButton.offsetWidth;
        const buttonOffsetLeft = activeButton.offsetLeft;

        const transformValue = containerWidth / 2 - buttonOffsetLeft - buttonWidth / 2;
        console.log(transformValue);
        container.style.transform = `translateX(${transformValue}px)`;
      }
    }
  }, [phaseProgress.currentVariable]);

  const canSelect: boolean[] = useMemo(() => {
    const cs = Array(phaseProgress.variables.length).fill(false);
    phaseProgress.variables.forEach((variableProgress, i) => {
      if (variableProgress.done) cs[i] = true;
      if (i > 0 && phaseProgress.variables[i - 1].done) cs[i] = true;
    });
    return cs;
  }, [phaseProgress.variables]);

  let validVariable = 0;
  let endReached = false;
  let showAll = true;

  const noneDone = phaseProgress.variables.every((variable) => !variable.done) && phaseProgress.currentVariable === 0;
  if (!showAll && noneDone) return null;
  if (phaseProgress.variables.length === 1) return null;

  return (
    <div className="relative z-50 mx-3 flex justify-center overflow-hidden bg-background/80 hover:bg-background">
      {/* <div className="absolute top-3 h-4 w-[3px] rounded-lg bg-primary" /> */}
      <div ref={containerRef} className="flex transition-transform duration-200 ease-in-out">
        {phaseProgress.variables.map((variableProgress, i) => {
          if (!showAll && variableProgress.skip) return null;
          validVariable++;

          if (!showAll && endReached) return null;
          if (i >= phaseProgress.currentVariable && !variableProgress.done && !variableProgress.skip) endReached = true;

          let dotStyle = canSelect[i] ? "bg-primary" : "bg-primary/50";
          if (phaseProgress.currentVariable === i) dotStyle = "bg-primary-dark";

          let distance = Math.max(0, Math.abs(phaseProgress.currentVariable - i) - 2);
          const size = Math.max(35 * Math.exp(-0.3 * distance), 1);

          return (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              disabled={phaseProgress.currentVariable === i || !canSelect[i]}
              className={`z-50 flex h-10 items-center rounded-none hover:bg-transparent disabled:opacity-100`}
              style={{ width: size + "px" }}
              onClick={() => {
                if (phaseProgress.currentVariable === i) return;
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
