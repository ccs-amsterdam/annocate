import { ProgressState, SwipeRefs, Transition } from "@/app/types";
import Document from "@/components/Document/Document";
import swipeControl from "@/functions/swipeControl";
import React, { RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { useSwipeable } from "react-swipeable";
import QuestionForm from "./QuestionForm";
// import FeedbackPortal from "./FeedbackPortal";
import { useJobContext } from "../AnnotatorProvider/AnnotatorProvider";
import QuestionIndexStep from "./QuestionIndexStep";

interface QuestionTaskProps {
  blockEvents?: boolean;
}

const QuestionTask = ({ blockEvents = false }: QuestionTaskProps) => {
  const { unit, height, variableMap, progress } = useJobContext();
  const { animateUnit } = useProgressTransition({ progress });
  const { refs, menuSwipe, textSwipe } = useSwipe();
  const divref = useRef<HTMLDivElement>(null);

  const variableId = progress.phases[progress.current.phase].variables[progress.current.variable].id;
  const variable = variableMap[variableId];

  if (!unit || !variable) return null;

  const hasContent = variable.layoutId !== undefined;

  return (
    <div
      key={progress.current.phase + "." + unit.token}
      className={`${animateUnit} relative flex h-full w-full flex-col overflow-hidden bg-background will-change-transform`}
      ref={divref}
    >
      {hasContent ? (
        <SwipeableDocument refs={refs} textSwipe={textSwipe}>
          <Document
            centered
            showAll={true}
            focus={variable?.field ? [variable.field] : undefined}
            blockEvents={blockEvents}
          />
        </SwipeableDocument>
      ) : null}

      <div
        {...menuSwipe}
        // key={unit.token + annotationLib.variableIndex} // Seems not needed for animate, but keeping it here just in case
        className={`${!hasContent ? "h-full overflow-auto" : null} relative flex-auto`}
      >
        <QuestionForm blockEvents={blockEvents} height={height} hasContent={hasContent} />
      </div>
    </div>
  );
};

function SwipeableDocument({
  children,
  refs,
  textSwipe,
}: {
  children: React.ReactNode;
  refs: SwipeRefs;
  textSwipe: any;
}) {
  return (
    <div {...textSwipe} className={`relative z-10 h-full min-h-0 flex-auto overflow-hidden`}>
      <div ref={refs.box} className="relative z-20 h-full overflow-hidden will-change-auto">
        {/* This div moves around behind the div containing the document to show the swipe code  */}
        <div ref={refs.code} className="absolute w-full px-1 py-2 text-lg" />
        <div ref={refs.text} className={`relative top-0 h-full`}>
          {children}
        </div>
      </div>
    </div>
  );
}

function useSwipe() {
  const { variableMap, progress, annotationManager } = useJobContext();
  const textref = useRef<HTMLDivElement>(null);
  const boxref = useRef<HTMLDivElement>(null);
  const coderef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => {
    return { text: textref, box: boxref, code: coderef };
  }, []);

  const variableId = progress.phases[progress.current.phase].variables[progress.current.variable].id;
  const variable = variableMap[variableId];

  function onSwipe(transition: Transition) {
    if (!transition.code) return;
    const context = variable.field ? { field: variable.field } : undefined;
    annotationManager.createQuestionAnnotation(variable.id, transition.code, undefined, false, context);
    annotationManager.finishVariable();
  }

  const textSwipe = useSwipeable(swipeControl(variable, refs, onSwipe, false));
  const menuSwipe = useSwipeable(swipeControl(variable, refs, onSwipe, true));

  return { refs, textSwipe, menuSwipe };
}

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

function useProgressTransition({ progress }: { progress: ProgressState }) {
  const prevUnit = useRef({ phase: -1, unit: 0 });

  const animateUnit = useMemo(() => {
    // dont animate on first render (phase -1)
    let animateUnit = prevUnit.current.phase === -1 ? "" : "animate-slide-in-bottom ease-out";

    if (
      (progress.current.phase === prevUnit.current.phase && progress.current.unit < prevUnit.current.unit) ||
      progress.current.unit < prevUnit.current.phase
    )
      animateUnit = "animate-slide-in-top  ease-out";

    prevUnit.current = { phase: progress.current.phase, unit: progress.current.unit };

    return animateUnit;
  }, [progress]);

  return { animateUnit };
}

export default React.memo(QuestionTask);
