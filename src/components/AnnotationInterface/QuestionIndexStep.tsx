import { useState, useEffect } from "react";
import { Answer, SetState, Variable } from "@/app/types";

import styled from "styled-components";
import { FaStepForward, FaStepBackward } from "react-icons/fa";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

const QuestionIndexDiv = styled.div`
  min-height: 10px;
  justify-content: right;
  align-items: flex-start;
  display: flex;

  .buttons {
    //min-width: 100px;
    padding-top: 0.5rem;
  }
  b {
    padding-top: 0.3rem;
  }
`;

const Icon = styled.div<{ disabled?: boolean; hidden?: boolean }>`
  display: ${(p) => (p.hidden ? "none" : "block")};
  font-size: 2rem;
  padding: 1rem;
  transform: scale(1, 1.1);
  padding: 0.3rem 0.8rem 0rem 0.8rem;
  cursor: ${(p) => (p.disabled ? "default" : "pointer")};
  color: ${(p) => (p.disabled ? "transparent" : "hsl(var(--primary-foreground))")};

  /* svg:hover {
    fill: ${(p) => (p.disabled ? "grey" : "hsl(var(--secondary))")};
  } */
`;

interface QuestionIndexStepProps {
  children?: React.ReactNode | React.ReactNode[];
  questions: Variable[];
  questionIndex: number;
  answers: Answer[];
  setQuestionIndex: SetState<number>;
}

export default function QuestionIndexStep({
  children,
  questions,
  questionIndex,
  answers,
  setQuestionIndex,
}: QuestionIndexStepProps) {
  //if (questions.length === 1) return null;
  const [canSelect, setCanSelect] = useState<boolean[]>([]);

  useEffect(() => {
    const done = answers.map((a: Answer) => {
      for (let item of a.items || []) {
        if (item.values == null || item.values.length === 0 || item.invalid) return false;
      }
      return true;
    });
    const irrelevant = answers.map((a: Answer) => a?.items?.[0] && a.items[0].values?.[0] === "IRRELEVANT");

    const cs = answers.map((_, i: number) => {
      if (i === 0) return true;
      return done[i - 1] && !irrelevant[i];
    });

    setCanSelect(cs);
  }, [answers, setCanSelect]);

  // useEffect(() => {
  //   setCanSelect((state) => {
  //     const newState = [...state];
  //     if (questionIndex >= newState.length) return null;
  //     newState[questionIndex] = true;
  //     return newState;
  //   });
  // }, [questionIndex, setCanSelect]);

  const previousIndex = getPreviousIndex(questionIndex, canSelect, answers);
  const nextIndex = getNextIndex(questionIndex, canSelect, questions, answers);
  //const visibleIndex = getVisibleIndex(answers, questionIndex);

  // hide if only 1 question that is not yet done
  const hide = questions.length === 1;

  return (
    <div className="flex h-full min-h-3 w-full items-center justify-between gap-2 ">
      <Button
        size="icon"
        variant="ghost"
        className={`h-full rounded-none ${hide ? "hidden" : ""}`}
        disabled={previousIndex === null}
        onClick={() => previousIndex !== null && setQuestionIndex(previousIndex)}
      >
        <ChevronLeft />
      </Button>
      {children}
      <Button
        size="icon"
        variant="ghost"
        className={`h-full ${hide ? "hidden" : ""}`}
        disabled={nextIndex === null}
        onClick={() => nextIndex !== null && setQuestionIndex(nextIndex)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function getPreviousIndex(questionIndex: number, canSelect: boolean[], answers: Answer[]) {
  for (let i = questionIndex - 1; i >= 0; i--) {
    if (!canSelect?.[i]) continue;
    if (answers?.[i]?.items?.[0].values?.[0] === "IRRELEVANT") continue;
    return i;
  }
  return null;
}
function getNextIndex(questionIndex: number, canSelect: boolean[], questions: Variable[], answers: Answer[]) {
  for (let i = questionIndex + 1; i < questions.length; i++) {
    if (!canSelect?.[i]) continue;
    if (answers?.[i]?.items?.[0].values?.[0] === "IRRELEVANT") continue;
    return i;
  }
  return null;
}

// function getVisibleIndex(answers: Answer[], questionIndex: number) {
//   // only show coder the index ignoring the irrelevant questions
//   let visibleIndex = 0;
//   for (let i = 0; i < questionIndex; i++) {
//     if (answers[i].items[0].values?.[0] === "IRRELEVANT") continue;
//     visibleIndex++;
//   }
//   return visibleIndex;
// }
