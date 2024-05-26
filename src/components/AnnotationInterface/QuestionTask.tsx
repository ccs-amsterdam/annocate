import React, { useState, useRef, RefObject, useCallback, useMemo } from "react";
import QuestionForm from "./QuestionForm";
import Document from "@/components/Document/Document";
import { useSwipeable } from "react-swipeable";
import swipeControl from "@/functions/swipeControl";
import styled from "styled-components";
import {
  Annotation,
  Codebook,
  ConditionReport,
  SessionData,
  SwipeRefs,
  Swipes,
  Unit,
  Transition,
  AnnotationLibrary,
  ExtendedCodebook,
} from "@/app/types";
import Instructions from "./Instructions";
// import FeedbackPortal from "./FeedbackPortal";
import useWatchChange from "@/hooks/useWatchChange";
import unfoldQuestions from "@/functions/unfoldQuestions";
import AnnotationManager, { useAnnotationManager } from "@/functions/AnnotationManager";

interface QuestionTaskProps {
  unit: Unit;
  codebook: ExtendedCodebook;
  nextUnit: () => void;
  blockEvents?: boolean;
}

const QuestionTask = ({ unit, codebook, nextUnit, blockEvents = false }: QuestionTaskProps) => {
  const { annotationLib, annotationManager } = useAnnotationManager(unit, codebook);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [conditionReport, setConditionReport] = useState<ConditionReport | null>(null);
  const divref = useRef(null);
  const textref = useRef(null);
  const boxref = useRef(null);
  const coderef = useRef(null);
  const refs = useMemo(() => {
    return { text: textref, box: boxref, code: coderef };
  }, []);

  const questions = useMemo(() => unfoldQuestions(codebook, unit), [unit, codebook]);
  const question = questions[questionIndex];

  if (useWatchChange([unit])) {
    setQuestionIndex(0);
    setConditionReport(unit.report || { evaluation: {}, damage: {} });
    hideUnit(refs.text, refs.box, refs.code); // hide unit until ready
  }

  const onNewUnit = useCallback(() => {
    // this is called in the onReady callback in Document
    showUnit(refs.text, refs.box, refs.code);
  }, [refs.text, refs.box, refs.code]);

  const startTransition = useCallback(
    (trans: Transition | undefined, nextUnit: boolean) => {
      if (nextUnit) {
        nextUnitTransition(refs, trans);
      } else {
        nextQuestionTransition(refs, trans);
        setTimeout(() => {
          showUnit(refs.text, refs.box, refs.code);
        }, 100);
      }
    },
    [refs],
  );

  // swipe controlls need to be up in the QuestionTask component due to working on the div containing the question screen
  // use separate swipe for text (document) and menu rows, because swiping up in the text is only possible if scrolled all the way down
  const [swipe, setSwipe] = useState<Swipes | null>(null);
  const textSwipe = useSwipeable(swipeControl(question, refs, setSwipe, false));
  const menuSwipe = useSwipeable(swipeControl(question, refs, setSwipe, true));

  if (!unit) return null;

  // two modes for highlighting annotations: a single annotation in question.annotation and
  // question.showAnnotations. Passing an array of annotations to Document highlights the spans
  // let annotations: Annotation[] = question?.annotation ? [question.annotation] : [];
  // if (question?.showAnnotations && unit.unit.annotations) {
  //   const addAnnotations = unit.unit.annotations.filter((a) => question.showAnnotations?.includes(a.variable));
  //   annotations = [...annotations, ...addAnnotations];
  // }
  let annotation: Annotation[] = [];

  const singlePage = unit.unitType === "survey";

  return (
    <div className="flex h-full flex-col bg-background" ref={divref}>
      {/* <FeedbackPortal
        variable={questions?.[questionIndex]?.name}
        conditionReport={conditionReport}
        setConditionReport={setConditionReport}
      /> */}
      <div
        {...textSwipe}
        className={`relative z-10 ${singlePage ? "min-h-0 flex-[1_0_auto]" : "min-h-[40%] flex-[1_1_0]"}`}
      >
        <div ref={refs.box} className="oveflow-hidden relative z-20 h-full will-change-auto">
          {/* This div moves around behind the div containing the document to show the swipe code  */}
          <div ref={refs.code} className="absolute w-full px-1 py-2 text-lg" />
          <div ref={refs.text} className="relative top-0 h-full will-change-auto">
            <Document
              unit={unit}
              annotations={[]}
              showAll={true}
              onReady={onNewUnit}
              focus={question?.fields}
              centered={true}
            />
          </div>
        </div>
      </div>
      <div {...menuSwipe} className={` ${singlePage ? "flex-[0_0_auto]" : "flex-[0_1_auto"}`}>
        <QuestionForm
          unit={unit}
          annotationLib={annotationLib}
          annotationManager={annotationManager}
          questions={questions}
          questionIndex={questionIndex}
          setQuestionIndex={setQuestionIndex}
          nextUnit={nextUnit}
          setConditionReport={setConditionReport}
          swipe={swipe}
          setSwipe={setSwipe}
          startTransition={startTransition}
          blockEvents={blockEvents}
        >
          <Instructions
            instruction={question?.instruction || codebook?.settings?.instruction}
            autoInstruction={codebook?.settings?.auto_instruction || false}
          />
        </QuestionForm>
      </div>
    </div>
  );
};

const nextUnitTransition = (r: SwipeRefs, trans: Transition | undefined) => {
  const direction = trans?.direction;
  const color = trans?.color || "var(--background)";
  if (r?.box?.current?.style != null && r?.text?.current != null) {
    r.text.current.style.transition = `transform 2000ms`;
    r.text.current.style.transform = `translateX(${
      direction === "right" ? 100 : direction === "left" ? -100 : 0
    }%) translateY(${direction ? "-100" : "0"}%)`;
    r.box.current.style.transition = `opacity 250ms linear`;
    r.box.current.style.background = color;
    r.box.current.style.opacity = "0";
  }
};

const nextQuestionTransition = (r: SwipeRefs, trans: Transition | undefined) => {
  if (!trans?.color) return;
  // if (r?.box?.current?.style != null && r?.text?.current != null) {
  //   r.text.current.style.transhsl(var(--background))nd 50ms ease-out`;
  //   r.text.current.style.background = trans.color;
  // }
};

const hideUnit = (text: RefObject<HTMLElement>, box: RefObject<HTMLElement>, code: RefObject<HTMLElement>): void => {
  if (!text.current || !box.current || !code.current) return;
  code.current.innerText = "";
  text.current.style.transition = ``;
  box.current.style.transition = ``;
  box.current.style.background = "var(--background)";
  box.current.style.opacity = "0";
  text.current.style.transform = "translateX(0%) translateY(0%)";
};

const showUnit = (text: RefObject<HTMLElement>, box: RefObject<HTMLElement>, code: RefObject<HTMLElement>): void => {
  if (!text.current || !box.current || !code.current) return;
  code.current.innerText = "";
  box.current.style.transition = `opacity 200ms linear`;
  box.current.style.opacity = "1";
  text.current.style.transition = `background 300ms, opacity 200ms`;
  text.current.style.transform = "translateX(0%) translateY(0%)";
  text.current.style.background = "var(--background)";
  text.current.style.opacity = "1";
  text.current.style.filter = "";
};

export default React.memo(QuestionTask);
