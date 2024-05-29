import React, { useState, useRef, ReactElement, useCallback, useEffect, useMemo } from "react";
import styled from "styled-components";
import useWatchChange from "@/hooks/useWatchChange";
import {
  Question,
  Unit,
  Answer,
  AnswerItem,
  SetState,
  Annotation,
  Swipes,
  ConditionReport,
  Transition,
  Variable,
  AnnotationLibrary,
} from "@/app/types";
import { getMakesIrrelevantArray, processIrrelevantBranching } from "@/functions/irrelevantBranching";
import { addAnnotationsFromAnswer, getAnswersFromAnnotations } from "@/functions/mapAnswersToAnnotations";
import AnswerField from "./AnswerField";
import QuestionIndexStep from "./QuestionIndexStep";
import overflowBordersEvent from "@/functions/overflowBordersEvent";
import AnnotationManager from "@/functions/AnnotationManager";
import { useAnnotations } from "../UnitProvider/UnitProvider";

interface QuestionFormProps {
  /** Buttons can be passed as children, that will be shown on the topleft of the question form */
  children: ReactElement | ReactElement[];
  /** The unit */
  unit: Unit;
  blockEvents: boolean;
}

const QuestionForm = ({ children, unit, blockEvents }: QuestionFormProps) => {
  const { annotationLib, annotationManager } = useAnnotations();
  const variable = annotationLib.variables[annotationLib.variableIndex];
  const questionRef = useRef<HTMLDivElement>(null);
  const blockAnswer = useRef(false); // to prevent answering double (e.g. with swipe events)

  const questionText = useMemo(
    () => prepareQuestion(unit, variable, Object.values(annotationLib.annotations)),
    [unit, variable, annotationLib],
  );

  useEffect(() => {
    const container = questionRef.current;
    if (!container) return;
    container.scrollTo(0, 0);
    const handleScroll = (e: Event) => overflowBordersEvent(container, true, false);
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [annotationLib.variableIndex]);

  // const onAnswer = useCallback(
  //   (items: AnswerItem[], onlySave = false, transition?: Transition): void => {
  //     // posts results and skips to next question, or next unit if no questions left.
  //     // If onlySave is true, only write to db without going to next question

  //     // Swipe is now passed down via a state, so state needs to be reset
  //     // before the next question or unit. It would probably be better to
  //     // do this via a function, but than this would need to be passed up from
  //     // AnswerField. At some point think of this when refactoring
  //     setSwipe(null);
  //     if (!answers || !setAnswers) return;

  //     processAnswer(
  //       items,
  //       onlySave,
  //       unit,
  //       questions,
  //       answers,
  //       questionIndex,
  //       nextUnit,
  //       setAnswers,
  //       setQuestionIndex,
  //       setConditionReport,
  //       (nextUnit: boolean) => startTransition(transition, nextUnit),
  //       blockAnswer,
  //     );
  //   },
  //   [
  //     answers,
  //     questionIndex,
  //     questions,
  //     setQuestionIndex,
  //     nextUnit,
  //     setConditionReport,
  //     unit,
  //     setSwipe,
  //     startTransition,
  //   ],
  // );

  if (!unit || !variable) return null;

  return (
    <div
      ref={questionRef}
      className="relative z-30 flex h-full min-h-60 w-full flex-col bg-background  text-[length:inherit] transition-[border]"
    >
      <div className="sticky left-0 top-0 z-40 flex w-full  flex-col justify-center border-y border-primary bg-gradient-to-b from-primary/40 from-0% via-primary/20 via-50% to-primary/40 to-100% ">
        <div className="flex-hidden">
          <QuestionIndexStep
            variables={annotationLib.variables}
            variableIndex={annotationLib.variableIndex}
            variableStatuses={annotationLib.variableStatuses}
            setQuestionIndex={(index: number) => annotationManager.setVariableIndex(index)}
          >
            <div className="relative z-20 mb-1 flex flex-auto items-center justify-center py-3 text-[length:inherit] ">
              <div className="  flex items-center justify-between gap-3 text-lg  ">
                <div>{questionText}</div>
                <div className="z-50 inline-block translate-y-1">{children}</div>
              </div>
            </div>
          </QuestionIndexStep>
        </div>
      </div>

      <div className="relative flex w-full flex-auto overflow-auto bg-primary/20 pt-2 text-[length:inherit] text-foreground">
        <AnswerField
          annotationLib={annotationLib}
          annotationManager={annotationManager}
          // answers={answers}
          // questions={questions}
          // questionIndex={questionIndex}
          // onAnswer={onAnswer}
          // swipe={swipe}
          blockEvents={blockEvents}
        />
      </div>
    </div>
  );
};

const prepareQuestion = (unit: Unit, question: Variable, annotations: Annotation[]) => {
  if (!question?.question) return <div />;
  let preparedQuestion = question.question;

  const regex = /{(.*?)}/g;
  if (annotations.length > 0) {
    // matchAll not yet supported by RStudio browser
    //const matches = [...Array.from(preparedQuestion.matchAll(regex))];
    //for (let m of matches) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(preparedQuestion))) {
      const m0: string = m[0];
      const m1: string = m[1];
      let value;
      if (unit.unit.variables) {
        value = unit.unit.variables[m1];
      }
      value = annotations.find((a) => a.variable === m1)?.code || value;

      if (value) {
        preparedQuestion = preparedQuestion.replace(m0, "{" + value + "}");
      }
    }
  }

  return markedString(preparedQuestion);
};

const markedString = (text: string) => {
  const regex = new RegExp(/{(.*?)}/); // Match text inside two curly brackets

  text = text.replace(/(\r\n|\n|\r)/gm, "");
  return (
    <>
      {text.split(regex).reduce((prev: (string | ReactElement)[], current: string, i: number) => {
        if (i % 2 === 0) {
          prev.push(current);
        } else {
          prev.push(
            <mark key={i + current} style={{ color: "hsl(var(--primary-foreground))", backgroundColor: "transparent" }}>
              {current}
            </mark>,
          );
        }
        return prev;
      }, [])}
    </>
  );
};

const processAnswer = async (
  items: AnswerItem[],
  onlySave = false,
  unit: Unit,
  questions: Variable[],
  answers: Answer[],
  questionIndex: number,
  nextUnit: () => void,
  setAnswers: SetState<Answer[] | null>,
  setQuestionIndex: SetState<number>,
  setConditionReport: SetState<ConditionReport | null>,
  transition: (nextUnit: boolean) => void,
  blockAnswer: any,
): Promise<void> => {
  if (blockAnswer.current) return;
  if (!questions[questionIndex] || !unit || !answers) return;

  blockAnswer.current = true;

  const variable = questions[questionIndex];
  const codes = "codes" in variable ? variable.codes : [];

  try {
    answers[questionIndex].items = items;
    answers[questionIndex].makes_irrelevant = getMakesIrrelevantArray(items, codes);

    unit.unit.annotations = addAnnotationsFromAnswer(answers[questionIndex], unit.unit.annotations);
    const irrelevantQuestions = processIrrelevantBranching(unit, questions, answers, questionIndex);

    // next (non-irrelevant) question in unit (null if no remaining)
    let newQuestionIndex: number | null = null;
    for (let i = questionIndex + 1; i < questions.length; i++) {
      if (irrelevantQuestions[i]) {
        unit.unit.annotations = addAnnotationsFromAnswer(answers[i], unit.unit.annotations);
        continue;
      }
      newQuestionIndex = i;
      break;
    }

    const status = newQuestionIndex === null ? "DONE" : "IN_PROGRESS";
    const cleanAnnotations = (unit.unit.annotations || []).map((a: Annotation): Annotation => {
      const buildAnnotation: any = {};
      for (let key of Object.keys(a)) {
        if (!["type", "field", "offset", "length", "variable", "value", "time_question", "time_answer"].includes(key))
          continue;
        buildAnnotation[key] = a[key as keyof Annotation];
      }
      return buildAnnotation;
    });

    if (onlySave) {
      // if just saving (for multivalue questions)
      unit.jobServer.postAnnotations(unit.unitId, cleanAnnotations, status);
      blockAnswer.current = false;
      return;
    }

    const start = new Date();
    const conditionReport: ConditionReport = await unit.jobServer.postAnnotations(
      unit.unitId,
      cleanAnnotations,
      status,
    );

    conditionReport.reportSuccess = true;
    setConditionReport(conditionReport);
    const action = conditionReport?.evaluation?.[questions[questionIndex].name]?.action;
    if (action === "block") {
      // TODO to be implemented
    } else if (action === "retry") {
      blockAnswer.current = false;
    } else {
      let minDelay;
      if (newQuestionIndex === null) {
        minDelay = 250;
        transition(true);
      } else {
        minDelay = 150;
        transition(false);
      }

      const delay = new Date().getTime() - start.getTime();
      const extradelay = Math.max(0, minDelay - delay);
      await new Promise((resolve) => setTimeout(resolve, extradelay));

      // check if there are other variables in the current unit that have an action
      for (let i = 0; i < questions.length; i++) {
        const action = conditionReport?.evaluation?.[questions[i].name]?.action;
        if (action === "block" || action === "retry") newQuestionIndex = i;
      }

      setAnswers([...answers]);
      if (newQuestionIndex !== null) {
        setQuestionIndex(newQuestionIndex);
      } else {
        nextUnit();
      }

      blockAnswer.current = false;
    }
  } catch (e) {
    console.error(e);
    // just to make certain the annotator doesn't block if something goes wrong
    blockAnswer.current = false;
  }
};

export default React.memo(QuestionForm);
