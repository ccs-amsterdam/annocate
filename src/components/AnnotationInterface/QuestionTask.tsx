import { Progress, SwipeRefs, Transition } from "@/app/types";
import Document from "@/components/Document/Document";
import swipeControl from "@/functions/swipeControl";
import React, { RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { useSwipeable } from "react-swipeable";
import QuestionForm from "./QuestionForm";
// import FeedbackPortal from "./FeedbackPortal";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import QuestionIndexStep from "./QuestionIndexStep";

interface QuestionTaskProps {
  blockEvents?: boolean;
}

const QuestionTask = ({ blockEvents = false }: QuestionTaskProps) => {
  const { unit, height, codebook, annotationLib, finishUnit, annotationManager, progress, selectUnit } = useUnit();
  const divref = useRef<HTMLDivElement>(null);
  const textref = useRef<HTMLDivElement>(null);
  const boxref = useRef<HTMLDivElement>(null);
  const coderef = useRef<HTMLDivElement>(null);
  const { animateUnit } = useProgressTransition({ progress });
  const refs = useMemo(() => {
    return { text: textref, box: boxref, code: coderef };
  }, []);

  const variable = annotationLib.variables?.[annotationLib.variableIndex];

  function onSwipe(transition: Transition) {
    if (!transition.code) return;
    annotationManager.processAnswer(variable.name, transition.code, false, variable.fields);
    annotationManager.postVariable(true).then((res) => {
      if (res.status === "DONE") {
        finishUnit();
        // nextUnitTransition(refs, transition);
        // setTimeout(() => {
        //   // showUnit(refs.text, refs.box, refs.code);
        // }, 100);
      } else {
        // nextQuestionTransition(refs, transition);
      }
    });
  }

  const textSwipe = useSwipeable(swipeControl(variable, refs, onSwipe, false));
  const menuSwipe = useSwipeable(swipeControl(variable, refs, onSwipe, true));

  if (!unit || !variable) return null;

  const hasContent = !!variable.layout;

  return (
    <div
      key={progress.phase + unit.token}
      className={`${animateUnit} relative flex h-full w-full flex-col overflow-hidden bg-background will-change-transform`}
      ref={divref}
    >
      {/* <FeedbackPortal
        variable={variable.name}
        conditionReport={conditionReport}
        setConditionReport={setConditionReport}
      /> */}

      {/* <div className="absolute w-full">
        <QuestionIndexStep />
      </div> */}

      {hasContent ? (
        <div {...textSwipe} className={`relative z-10 h-full min-h-0 flex-auto overflow-hidden`}>
          <div ref={refs.box} className="relative z-20 h-full overflow-hidden will-change-auto">
            {/* This div moves around behind the div containing the document to show the swipe code  */}
            <div ref={refs.code} className="absolute w-full px-1 py-2 text-lg" />
            <div ref={refs.text} className={`relative top-0 h-full`}>
              <Document centered showAll={true} focus={variable?.fields} blockEvents={blockEvents} />
            </div>
          </div>
        </div>
      ) : null}

      <div
        {...menuSwipe}
        // key={unit.token + annotationLib.variableIndex} // Seems not needed for animate, but keeping it here just in case
        className={`${!hasContent ? "h-full overflow-auto" : null} relative flex-auto`}
      >
        <QuestionForm
          unit={unit}
          codebook={codebook}
          annotationLib={annotationLib}
          annotationManager={annotationManager}
          blockEvents={blockEvents}
          height={height}
        />
      </div>
    </div>
  );
};

// const nextUnitTransition = (r: SwipeRefs, trans: Transition | undefined) => {
//   const direction = trans?.direction;
//   const color = trans?.code?.color || "var(--background)";
//   if (r?.box?.current?.style != null && r?.text?.current != null) {
//     r.text.current.style.transition = `transform 2000ms`;
//     r.text.current.style.transform = `translateX(${
//       direction === "right" ? 100 : direction === "left" ? -100 : 0
//     }%) translateY(${direction ? "-100" : "0"}%)`;
//     r.box.current.style.transition = `opacity 250ms linear`;
//     r.box.current.style.background = color;
//     r.box.current.style.opacity = "0";
//   }
// };

// const nextQuestionTransition = (r: SwipeRefs, trans: Transition | undefined) => {
//   if (!trans?.code?.color) return;
//   // if (r?.box?.current?.style != null && r?.text?.current != null) {
//   //   r.text.current.style.transhsl(var(--background))nd 50ms ease-out`;
//   //   r.text.current.style.background = trans.color;
//   // }
// };

function useProgressTransition({ progress }: { progress: Progress }) {
  const prevUnit = useRef({ phase: -1, unit: 0 });

  const animateUnit = useMemo(() => {
    let animateUnit = "animate-slide-in-bottom ease-out";

    const phase = progress.phases[progress.phase];
    const currentUnit = phase.type === "annotation" ? phase.currentUnit : 0;
    if (
      (progress.phase === prevUnit.current.phase && currentUnit < prevUnit.current.unit) ||
      progress.phase < prevUnit.current.phase
    )
      animateUnit = "animate-slide-in-top  ease-out";

    prevUnit.current = { phase: progress.phase, unit: currentUnit };

    return animateUnit;
  }, [progress]);

  return { animateUnit };
}

export default React.memo(QuestionTask);
