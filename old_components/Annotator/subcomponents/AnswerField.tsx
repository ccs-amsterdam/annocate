import React, { useEffect, useRef, useState } from "react";
import Annotinder from "./AnswerFieldAnnotinder";
import Confirm from "./AnswerFieldConfirm";
import Scale from "./AnswerFieldScale";
import SearchCode from "./AnswerFieldSearchCode";
import SelectCode from "./AnswerFieldSelectCode";
import Inputs from "./AnswerFieldInputs";
import { AnswerItem, OnSelectParams, Swipes, Question, Answer, Transition } from "@/app/types";
import styled, { CSSProperties } from "styled-components";

const AnswerDiv = styled.div`
  transition: all 0.3s;
  display: grid;
  grid-template-rows: auto;
  position: relative;
  padding: 0;

  width: 100%;
  margin: auto 0;
  font-size: inherit;
  color: var(--foreground);

  & .InnerAnswerField {
    width: 100%;
    margin-top: auto;
  }
`;

interface AnswerFieldProps {
  answers: Answer[];
  questions: Question[];
  questionIndex: number;
  onAnswer: (items: AnswerItem[], onlySave: boolean, transition?: Transition) => void;
  swipe: Swipes | null;
  blockEvents?: boolean;
}

const AnswerField = ({ answers, questions, questionIndex, onAnswer, swipe, blockEvents = false }: AnswerFieldProps) => {
  const [question, setQuestion] = useState<Question | null>(null);
  const [answerItems, setAnswerItems] = useState<AnswerItem[] | null>(null);
  const questionDate = useRef<Date>(new Date());
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentAnswer = answers?.[questionIndex]?.items;
    questionDate.current = new Date();
    // Note that currentAnswer:
    // is an array of objects: [{item: 'string of item name', values: [array of unique answer values]}]
    // order and length mathces question.items. If question doesn't have items, it must be an array of length 1
    setAnswerItems(currentAnswer);
    setQuestion(questions[questionIndex]);
  }, [answers, questions, questionIndex, questionDate]);

  useEffect(() => {
    // if answer changed but has not been saved, warn users when they try to close the app
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const msg = "If you leave now, any changes made in the current unit will not be saved."; // most browsers actually show default message
      e.returnValue = msg;
      return msg;
    };

    if (answers?.[questionIndex]?.items !== answerItems) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    } else {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [answers, questionIndex, answerItems]);

  useEffect(() => {
    const el = answerRef.current;
    function resize() {
      const innerEl = el?.children?.[0];
      if (!innerEl || !answerRef.current) return;

      const style = answerRef.current.style;
      style["grid-template-rows" as any] = innerEl.clientHeight + "px";
    }

    // first do a quick update, using a small delay that is enough for most content
    const timer = setTimeout(() => resize(), 50);
    // then check whether height needs to change with short intervalls. This is fairly inexpensive
    // and ensures that theres no issues when content is slow to load (e.g., images)
    const interval = setInterval(() => {
      resize();
    }, 500);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [answerRef, onAnswer]);

  const onFinish = () => {
    if (!answerItems) return;
    onAnswer(answerItems, false);
  };

  const onSelect = ({
    value,
    itemIndex = 0,
    multiple = false,
    finish = false,
    invalid = false,
    save = false,
    transition,
  }: OnSelectParams = {}) => {
    // this bad boy is used in all of the AnswerField sub-components to write values.
    // it's a bit complicated here, but it makes the code within the sub-components easier.
    // answerItems is an array of objects, where each object is an item.
    //    if a question has no items (i.e. just a single value), it is still an array of length 1 for consistency
    // each item object has a .value, which is an array of multiple values
    //    if an item can only have 1 value, it is still an array of length 1 for consistency

    if (!answerItems?.[itemIndex]) return;
    if (!value) return;

    answerItems[itemIndex].questionTime = questionDate.current.toISOString();
    answerItems[itemIndex].answerTime = new Date().toISOString();

    if (Array.isArray(value)) {
      // if value is an array, write exact array to answer
      answerItems[itemIndex] = {
        ...answerItems[itemIndex],
        values: value,
      };
    } else {
      // if a single value, check whether it should be treated as multiple, or add as array of length 1
      if (multiple) {
        const valueIndex = answerItems[itemIndex].values.findIndex((v: string | number | undefined) => v === value);
        if (valueIndex < 0) {
          // if value doesn't exist yet, add it
          answerItems[itemIndex].values.push(value);
        } else {
          // if it does exist, remove it
          answerItems[itemIndex].values.splice(valueIndex, 1);
        }
      } else {
        answerItems[itemIndex] = { ...answerItems[itemIndex], values: [value] };
      }
    }

    const newAnswerItems = [...answerItems];
    newAnswerItems[itemIndex].invalid = invalid;
    setAnswerItems(newAnswerItems);
    if (finish) {
      onAnswer(newAnswerItems, false, transition);
    } else {
      if (save) onAnswer(newAnswerItems, true);
    }
    return newAnswerItems;
  };

  if (!answerItems) return null;
  // use these props:
  // values         array of values
  // answerItems     object with items as keys and values array as value

  let answerfield = null;

  if (question?.type === "select code")
    answerfield = (
      <SelectCode
        options={question.options || []}
        values={answerItems[0].values || []} // only use first because selectCode doesn't support items
        multiple={!!question.multiple}
        vertical={!!question.vertical}
        sameSize={!!question.same_size}
        onSelect={onSelect}
        onFinish={onFinish}
        blockEvents={blockEvents} // for disabling key/click events
        questionIndex={questionIndex} // for use in useEffect for resetting values on question change
      />
    );

  if (question?.type === "search code")
    answerfield = (
      <SearchCode
        options={question.options || []}
        values={answerItems[0].values}
        multiple={!!question.multiple}
        onSelect={onSelect}
        onFinish={onFinish}
        blockEvents={blockEvents}
      />
    );

  if (question?.type === "scale")
    answerfield = (
      <Scale
        answerItems={answerItems}
        items={question.items || []}
        options={question.options || []}
        onSelect={onSelect}
        onFinish={onFinish}
        blockEvents={blockEvents}
        questionIndex={questionIndex}
      />
    );

  if (question?.type === "annotinder" && question.swipeOptions)
    answerfield = (
      <Annotinder
        answerItems={answerItems}
        swipeOptions={question.swipeOptions}
        onSelect={onSelect}
        swipe={swipe}
        blockEvents={blockEvents}
      />
    );

  if (question?.type === "confirm")
    answerfield = (
      <Confirm
        onSelect={onSelect}
        button={question.options?.[0]?.code || "continue"}
        swipe={swipe}
        blockEvents={blockEvents}
      />
    );

  if (question?.type === "inputs")
    answerfield = (
      <Inputs
        items={question.items || [null]}
        answerItems={answerItems}
        onSelect={onSelect}
        onFinish={onFinish}
        blockEvents={blockEvents}
        questionIndex={questionIndex}
      />
    );

  return (
    <AnswerDiv ref={answerRef}>
      <div className="InnerAnswerField">{answerfield}</div>
    </AnswerDiv>
  );
};

export default React.memo(AnswerField);
