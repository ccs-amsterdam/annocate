import { AnnotationLibrary, AnswerItem, Code } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import React, { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import SelectCode from "./AnswerFieldSelectCode";
import Scale from "./AnswerFieldScale";
import Annotinder from "./AnswerFieldAnnotinder";
import useSpeedBump from "@/hooks/useSpeedBump";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";

interface AnswerFieldProps {
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  // answers: Answer[];
  // questions: Variable[];
  // questionIndex: number;
  // onAnswer: (items: AnswerItem[], onlySave: boolean, transition?: Transition) => void;
  // swipe: Swipes | null;
  blockEvents?: boolean;
}

export interface OnSelectParams {
  code: Code;
  multiple?: boolean;
  finish?: boolean;
  item?: string;
}

const AnswerField = ({ annotationLib, annotationManager, blockEvents = false }: AnswerFieldProps) => {
  const { unit, codebook, height, progress, selectUnit } = useUnit();
  const questionDate = useRef<Date>(new Date());
  const answerRef = useRef<HTMLDivElement>(null);

  const variables = annotationLib.variables;
  const variableIndex = annotationLib.variableIndex;
  const variable = variables?.[variableIndex];

  const speedbump = useSpeedBump(String(progress.currentUnit || "") + annotationLib.variableIndex, 100);

  useEffect(() => {
    // if answer changed but has not been saved, warn users when they try to close the app
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const msg = "If you leave now, any changes made in the current unit will not be saved."; // most browsers actually show default message
      e.returnValue = msg;
      return msg;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [variables, variableIndex]);

  useEffect(() => {
    let height = 0;
    const el = answerRef.current;
    function resize() {
      const innerEl = el?.children?.[0];
      if (!innerEl || !answerRef.current) return;

      height = Math.max(height, innerEl.clientHeight);

      const style = answerRef.current.style;
      if (style["grid-template-rows" as any] !== height + "px") style["grid-template-rows" as any] = height + "px";
    }

    // first do immediate update
    const timer = setTimeout(() => resize(), 0);
    // then with intervals for slow loading content
    const interval = setInterval(() => {
      resize();
    }, 200);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [answerRef]);

  const annotations = useMemo(() => {
    let fullVariableNames: Record<string, boolean> = {};
    const items = "items" in variable ? variable.items || [] : [];
    if (items.length > 0) {
      items.forEach((item) => {
        fullVariableNames[`${variable.name}.${item.name}`] = true;
      });
    } else {
      fullVariableNames[variable.name] = true;
    }

    return Object.values(annotationLib.annotations).filter((a) => fullVariableNames[a.variable]);
  }, [variable, annotationLib]);

  const onFinish = () => {
    annotationManager.postVariable(true).then((res) => {
      if (res.status === "DONE") selectUnit((progress.currentUnit || 0) + 1);
    });
  };

  const onSelect = ({ code, multiple, item, finish }: OnSelectParams) => {
    let varname = variable.name;
    if (item) varname += `.${item}`;
    annotationManager.processAnswer(varname, code, !!multiple, variable.fields);
    if (finish) onFinish();
  };

  let answerfield = null;

  if (variable.type === "select code")
    answerfield = (
      <SelectCode
        options={variable.codes || []}
        annotations={annotations} // ts not smart enough
        multiple={!!variable.multiple}
        vertical={!!variable.vertical}
        onSelect={onSelect}
        onFinish={onFinish}
        blockEvents={blockEvents} // for disabling key/click events
        questionIndex={variableIndex} // for use in useEffect for resetting values on question change
        speedbump={speedbump}
      />
    );

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
        variable={variable.name}
        items={variable.items || []}
        options={variable.codes || []}
        onSelect={onSelect}
        onFinish={onFinish}
        blockEvents={blockEvents}
        questionIndex={variableIndex}
      />
    );

  if (variable?.type === "annotinder")
    answerfield = (
      <Annotinder
        value={annotations.find((a) => a.variable === variable.name)?.code}
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
      className={`relative mx-0 my-auto grid  w-full grid-rows-[auto] overflow-hidden   p-0 text-[length:inherit] text-foreground transition-all `}
    >
      <div className={`mt-auto w-full overflow-auto`}>
        <div className="py-2">{answerfield}</div>
      </div>
    </div>
  );
};

export default React.memo(AnswerField);
