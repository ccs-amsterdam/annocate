import { AnnotationLibrary, AnswerItem, Code } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import React, { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import SelectCode from "./AnswerFieldSelectCode";
import Scale from "./AnswerFieldScale";
import Annotinder from "./AnswerFieldAnnotinder";
import useSpeedBump from "@/hooks/useSpeedBump";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import { toast } from "sonner";
import { m } from "next-usequerystate/dist/serializer-C_l8WgvO";

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
  const { unit, height, progress, selectUnit } = useUnit();
  const questionDate = useRef<Date>(new Date());
  const answerRef = useRef<HTMLDivElement>(null);

  const variables = annotationLib.variables;
  const variableIndex = annotationLib.variableIndex;
  const variable = variables?.[variableIndex];

  const speedbump = useSpeedBump(String(progress.current || "") + annotationLib.variableIndex, 100);

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
    const el = answerRef.current;
    function resize() {
      const innerEl = el?.children?.[0];
      if (!innerEl || !answerRef.current) return;

      const style = answerRef.current.style;
      if (style["grid-template-rows" as any] !== innerEl.clientHeight + "px")
        style["grid-template-rows" as any] = innerEl.clientHeight + "px";
    }

    // first do a quick update, using a small delay that is enough for most content
    const timer = setTimeout(() => resize(), 100);
    // then check whether height needs to change with short intervalls. This is fairly inexpensive
    // and ensures that theres no issues when content is slow to load (e.g., images)
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
    annotationManager.finishVariable().then((res) => {
      if (res.status === "DONE") selectUnit((progress.current || 0) + 1);
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

  let animate = "";
  if (annotationLib.previousIndex < variableIndex) animate = "animate-slide-in-right";
  if (annotationLib.previousIndex > variableIndex) animate = "animate-slide-in-left";

  const maxHeightPercent = unit.type === "survey" ? 100 : 40;

  return (
    <div
      ref={answerRef}
      className={`relative mx-0 my-auto grid  w-full grid-rows-[auto] overflow-hidden   p-0 text-[length:inherit] text-foreground transition-all `}
    >
      <div
        className={`${animate} mt-auto w-full overflow-auto`}
        style={{ maxHeight: `${Math.round((maxHeightPercent * height) / 100)}px` }}
      >
        <div className="py-2">{answerfield}</div>
      </div>
    </div>
  );
};

export default React.memo(AnswerField);
