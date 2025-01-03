import React, { useState, useRef, RefObject, useCallback, useMemo } from "react";
import QuestionForm from "./QuestionForm";
import Document from "../../Document/Document";
import { useSwipeable } from "react-swipeable";
import swipeControl from "@/functions/swipeControl";
import styled from "styled-components";
import {
  Annotation,
  CodeBook,
  ConditionReport,
  FullScreenNode,
  SessionData,
  SwipeRefs,
  Swipes,
  Unit,
  Transition,
} from "@/app/types";
import Instructions from "./Instructions";
import FeedbackPortal from "./FeedbackPortal";
import useWatchChange from "@/hooks/useWatchChange";
import unfoldQuestions from "@/functions/unfoldQuestions";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;

  background: hsl(var(--background));
`;

const ContentWindow = styled.div<{ fullSize?: boolean }>`
  flex: ${(p) => (p.fullSize ? `1 0 auto` : `1 1 0`)};
  min-height: ${(p) => (p.fullSize ? "none" : "40%")};
  position: relative;
  z-index: 1;

  &::after {
    content: "";
    display: block;
    position: absolute;
    bottom: 0px;
    left: 0px;
    height: 10px;
    width: calc(100% - 5px);
    background: linear-gradient(transparent, var(--background) 100%);
    z-index: 100;
  }
`;

const QuestionMenu = styled.div<{
  fullSize?: boolean;
}>`
  //overflow: auto;
  flex: ${(p) => (p.fullSize ? `0 0 auto` : `0 1 auto`)};
  font-size: 1.2em;
`;

const SwipeableBox = styled.div`
  height: 100%;
  overflow: hidden;
  outline: 1px solid black;
  outline-offset: -2px;
  position: relative;
  will-change: opacity, transform;
  z-index: 20;
`;

const SwipeCode = styled.div`
  padding: 0.6em 0.3em;
  width: 100%;
  font-size: 3em;
  position: absolute;
`;

const Content = styled.div`
  height: 100%;
  position: relative;
  top: 0;
  font-size: 1em;
  box-shadow: 0px 0px 10px 5px var(--background-inversed-fixed);
  will-change: background, transform;
`;

interface QuestionTaskProps {
  unit: Unit;
  codebook: CodeBook;
  nextUnit: () => void;
  fullScreenNode: FullScreenNode;
  sessionData: SessionData;
  blockEvents?: boolean;
}

const QuestionTask = ({
  unit,
  codebook,
  nextUnit,
  fullScreenNode,
  sessionData,
  blockEvents = false,
}: QuestionTaskProps) => {
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
  let annotations: Annotation[] = question?.annotation ? [question.annotation] : [];
  if (question?.showAnnotations && unit.unit.annotations) {
    const addAnnotations = unit.unit.annotations.filter((a) => question.showAnnotations?.includes(a.variable));
    annotations = [...annotations, ...addAnnotations];
  }

  const singlePage = unit.unitType === "survey";

  return (
    <Container className="QuestionContainer" ref={divref}>
      <FeedbackPortal
        variable={questions?.[questionIndex]?.name}
        conditionReport={conditionReport}
        setConditionReport={setConditionReport}
        fullScreenNode={fullScreenNode}
      />
      <ContentWindow {...textSwipe} fullSize={singlePage}>
        <SwipeableBox ref={refs.box}>
          {/* This div moves around behind the div containing the document to show the swipe code  */}
          <SwipeCode ref={refs.code} />
          <Content ref={refs.text}>
            <Document
              unit={unit}
              annotations={annotations}
              showAll={true}
              onReady={onNewUnit}
              focus={question?.fields}
              centered
            />
          </Content>
        </SwipeableBox>
      </ContentWindow>
      <QuestionMenu {...menuSwipe} fullSize={singlePage}>
        <QuestionForm
          unit={unit}
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
            sessionData={sessionData}
          />
        </QuestionForm>
      </QuestionMenu>
    </Container>
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

const hideUnit = (text: RefObject<HTMLElement | null>, box: RefObject<HTMLElement | null>, code: RefObject<HTMLElement | null>): void => {
  if (!text.current || !box.current || !code.current) return;
  code.current.innerText = "";
  text.current.style.transition = ``;
  box.current.style.transition = ``;
  box.current.style.background = "var(--background)";
  box.current.style.opacity = "0";
  text.current.style.transform = "translateX(0%) translateY(0%)";
};

const showUnit = (text: RefObject<HTMLElement | null>, box: RefObject<HTMLElement | null>, code: RefObject<HTMLElement | null>): void => {
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
