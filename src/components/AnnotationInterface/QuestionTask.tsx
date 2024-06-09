import { Annotation, Code, ConditionReport, ExtendedCodebook, SwipeRefs, Swipes, Transition, Unit } from "@/app/types";
import Document from "@/components/Document/Document";
import swipeControl from "@/functions/swipeControl";
import React, { RefObject, useCallback, useMemo, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import ShowQuestion from "./ShowQuestion";
import QuestionForm from "./QuestionForm";
// import FeedbackPortal from "./FeedbackPortal";
import unfoldQuestions from "@/functions/unfoldQuestions";
import useWatchChange from "@/hooks/useWatchChange";
import { useUnit } from "../UnitProvider/UnitProvider";

interface QuestionTaskProps {
  blockEvents?: boolean;
}

const QuestionTask = ({ blockEvents = false }: QuestionTaskProps) => {
  const { unit, codebook, annotationLib, annotationManager, index, selectUnit } = useUnit();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [conditionReport, setConditionReport] = useState<ConditionReport | null>(null);
  const divref = useRef(null);
  const textref = useRef(null);
  const boxref = useRef(null);
  const coderef = useRef(null);
  const refs = useMemo(() => {
    return { text: textref, box: boxref, code: coderef };
  }, []);

  const variable = annotationLib.variables?.[annotationLib.variableIndex];

  const onNewUnit = useCallback(() => {
    // this is called in the onReady callback in Document
    showUnit(refs.text, refs.box, refs.code);
  }, [refs.text, refs.box, refs.code]);

  function onSwipe(transition: Transition) {
    if (!transition.code) return;
    annotationManager.processAnswer(variable.name, transition.code, false, variable.fields);
    annotationManager.finishVariable().then((res) => {
      if (res.status === "DONE") {
        selectUnit(index || 0 + 1);
        nextUnitTransition(refs, transition);
        setTimeout(() => {
          showUnit(refs.text, refs.box, refs.code);
        }, 100);
      } else {
        nextQuestionTransition(refs, transition);
      }
    });
  }

  const textSwipe = useSwipeable(swipeControl(variable, refs, onSwipe, false));
  const menuSwipe = useSwipeable(swipeControl(variable, refs, onSwipe, true));

  if (!unit) return null;

  const singlePage = unit.unitType === "survey";

  return (
    <div className="flex h-full flex-col bg-background" ref={divref}>
      {/* <FeedbackPortal
        variable={variable.name}
        conditionReport={conditionReport}
        setConditionReport={setConditionReport}
      /> */}
      <div
        {...textSwipe}
        className={`relative z-10 overflow-hidden ${singlePage ? "min-h-0 flex-[1_0_auto]" : "min-h-[40%] flex-[1_1_0]"}`}
      >
        <div ref={refs.box} className="oveflow-hidden relative z-20 h-full will-change-auto">
          {/* This div moves around behind the div containing the document to show the swipe code  */}
          <div ref={refs.code} className="absolute w-full px-1 py-2 text-lg" />
          <div ref={refs.text} className={`relative top-0 h-full will-change-auto`}>
            <Document
              unit={unit}
              annotations={[]}
              showAll={true}
              onReady={onNewUnit}
              focus={variable?.fields}
              centered={true}
              blockEvents={blockEvents}
            />
          </div>
        </div>
      </div>
      <div {...menuSwipe} className={` ${singlePage ? "flex-[0_0_auto]" : "flex-[0_1_auto"}`}>
        <QuestionForm
          unit={unit}
          codebook={codebook}
          annotationLib={annotationLib}
          annotationManager={annotationManager}
          blockEvents={blockEvents}
        />
      </div>
    </div>
  );
};

const nextUnitTransition = (r: SwipeRefs, trans: Transition | undefined) => {
  const direction = trans?.direction;
  const color = trans?.code?.color || "var(--background)";
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
  if (!trans?.code?.color) return;
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
