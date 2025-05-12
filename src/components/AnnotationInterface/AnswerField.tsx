import React, { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import SelectCode from "./AnswerFieldSelectCode";
import Scale from "./AnswerFieldScale";
import Annotinder from "./AnswerFieldAnnotinder";
import useSpeedBump from "@/hooks/useSpeedBump";
import { useJobContext } from "../AnnotatorProvider/AnnotatorProvider";
import { AnnotationLibrary, Code, QuestionAnnotation } from "@/app/types";
import AnnotationManager from "@/classes/AnnotationManager";

interface AnswerFieldProps {
  blockEvents?: boolean;
}

export interface OnSelectParams {
  code: Code;
  multiple?: boolean;
  finish?: boolean;
  item?: string;
}

const AnswerField = ({ blockEvents = false }: AnswerFieldProps) => {
  const { variableMap, progress, annotationLib, annotationManager } = useJobContext();

  const questionDate = useRef<Date>(new Date());
  const answerRef = useRef<HTMLDivElement>(null);
  const variableId = progress.phases[progress.current.phase].variables[progress.current.variable].id;
  const variable = variableMap[variableId];

  // TODO remove speedbumps (jeej)
  const speedbump = false;

  // WE USED TO ANIMATE HEIGHT CHANGES OF ANSWERFIELD, BUT NOW WE SLIDE IN FROM RIGHT
  // SO THIS IS NO LONGER NEEDED (AND IT'S A BIT OF A HACK)
  //
  // useEffect(() => {
  //   let height = 0;
  //   const el = answerRef.current;
  //   function resize() {
  //     const innerEl = el?.children?.[0];
  //     if (!innerEl || !answerRef.current) return;

  //     height = Math.max(height, innerEl.clientHeight);

  //     const style = answerRef.current.style;
  //     if (style["grid-template-rows" as any] !== height + "px") style["grid-template-rows" as any] = height + "px";
  //   }

  //   // first do immediate update
  //   const timer = setTimeout(() => resize(), 0);
  //   // then with intervals for slow loading content
  //   const interval = setInterval(() => {
  //     resize();
  //   }, 200);
  //   return () => {
  //     clearTimeout(timer);
  //     clearInterval(interval);
  //   };
  // }, [answerRef]);

  const annotations: QuestionAnnotation[] = useMemo(() => {
    // filter annotations to only current variable, and let TS know
    // these are of the 'question' type
    const questionAnnotations: QuestionAnnotation[] = [];

    for (let a of Object.values(annotationLib.annotations)) {
      if (a.type !== "question") continue;
      if (a.variableId !== variable.id) continue;
      questionAnnotations.push(a);
    }
    return questionAnnotations;
  }, [variable, annotationLib]);

  const context = variable.field ? { field: variable.field } : undefined;
  const finishLoop = true;

  const onSubmit = () => {
    annotationManager.submitVariable(variable.id, context, finishLoop);
    annotationManager.finishVariable();
  };

  const onSelect = ({ code, multiple, item, finish }: OnSelectParams) => {
    annotationManager.createQuestionAnnotation(variable.id, code, item, !!multiple, context, finishLoop);
    if (finish) annotationManager.finishVariable();
  };

  let answerfield = null;

  if (variable.type === "select code") {
    answerfield = (
      <SelectCode
        options={variable.codes || []}
        annotations={annotations}
        multiple={!!variable.multiple}
        vertical={!!variable.vertical}
        onSelect={onSelect}
        onFinish={onSubmit}
        blockEvents={blockEvents} // for disabling key/click events
        questionIndex={progress.current.variable} // for use in useEffect for resetting values on question change
        speedbump={speedbump}
      />
    );
  }

  // if (question?.type === "search code")
  //   answerfield = (
  //     <SearchCode
  //       options={question.codes || []}
  //       values={answerItems[0].values}
  //       multiple={!!question.multiple}
  //       onSelect={onSelect}
  //       onFinish={onFinish}
  //       blockEvents={blockEvents}
  //     />
  //   );

  if (variable.type === "scale")
    answerfield = (
      <Scale
        annotations={annotations}
        items={variable.items || []}
        options={variable.codes || []}
        onSelect={onSelect}
        onFinish={onSubmit}
        blockEvents={blockEvents}
        questionIndex={progress.current.variable}
      />
    );

  if (variable?.type === "annotinder")
    answerfield = (
      <Annotinder
        value={annotations[0]?.code}
        codes={variable.codes || []}
        onSelect={onSelect}
        blockEvents={blockEvents}
        speedbump={speedbump}
      />
    );

  // if (question?.type === "confirm")
  //   answerfield = <Confirm onSelect={onSelect} button={"continue"} swipe={swipe} blockEvents={blockEvents} />;

  // if (question?.type === "inputs")
  //   answerfield = (
  //     <Inputs
  //       items={question.items || [null]}
  //       answerItems={answerItems}
  //       onSelect={onSelect}
  //       onFinish={onFinish}
  //       blockEvents={blockEvents}
  //       questionIndex={questionIndex}
  //     />
  //   );

  return (
    <div
      ref={answerRef}
      className={`relative mx-0 my-auto grid w-full grid-rows-[auto] overflow-hidden p-0 text-[length:inherit] text-foreground transition-all`}
    >
      <div className={`mt-auto w-full overflow-auto`}>
        <div className="py-2">{answerfield}</div>
      </div>
    </div>
  );
};

export default React.memo(AnswerField);
