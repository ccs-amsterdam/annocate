import { AnnotationLibrary, CodebookPhase, ExtendedCodebook, Unit } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import overflowBordersEvent from "@/functions/overflowBordersEvent";
import React, { ReactElement, useEffect, useMemo, useRef } from "react";
import AnswerField from "./AnswerField";
import ShowQuestion from "./ShowQuestion";
import Markdown from "../Common/Markdown";
import VariableInstructions from "./VariableInstructions";
import QuestionIndexStep from "./QuestionIndexStep";

interface QuestionFormProps {
  unit: Unit;
  codebook: ExtendedCodebook;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  blockEvents: boolean;
  height: number;
}

const QuestionForm = ({ unit, codebook, annotationLib, annotationManager, blockEvents, height }: QuestionFormProps) => {
  const variable = annotationLib.variables[annotationLib.variableIndex];
  const questionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = questionRef.current;
    if (!container) return;
    container.scrollTo(0, 0);
    const handleScroll = (e: Event) => overflowBordersEvent(container, true, false);
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [annotationLib.variableIndex]);

  if (!unit || !variable) return null;

  const maxHeightPercent = unit.type === "survey" ? 100 : 60;

  let animate = "";
  if (annotationLib.previousIndex < annotationLib.variableIndex) animate = "animate-slide-in-right ease-out";
  if (annotationLib.previousIndex > annotationLib.variableIndex) animate = "animate-slide-in-left ease-out";

  return (
    <div
      ref={questionRef}
      style={{ maxHeight: `${Math.round((maxHeightPercent * height) / 100)}px` }}
      className={`${getCodebookStyling(codebook).container} relative z-30 flex flex-col overflow-hidden text-[length:inherit] transition-[border]`}
    >
      <div className={`${getCodebookStyling(codebook).text} relative z-40 flex w-full flex-col px-3 pt-1`}>
        {/* <VariableInstructions unit={unit} annotationLib={annotationLib} codebook={codebook} /> */}
        <div className={`${getCodebookStyling(codebook).question} ${animate}`}>
          <ShowQuestion unit={unit} annotationLib={annotationLib} codebook={codebook} />
        </div>
      </div>

      <div
        key={annotationLib.variableIndex}
        className={`${animate} relative flex w-full flex-auto text-[length:inherit] text-foreground will-change-transform`}
      >
        <AnswerField annotationLib={annotationLib} annotationManager={annotationManager} blockEvents={blockEvents} />
      </div>
    </div>
  );
};

function getCodebookStyling(codebook: CodebookPhase) {
  if (codebook.type.includes("survey")) {
    return {
      container: "text-foreground bg-background min-h-full pt-6  ",
      text: "mt-6 w-full h-full flex-auto text-start",
      question: "text-2xl font-bold text-center ",
    };
  }
  return {
    container: "text-foreground  overflow-auto pt-1 bg-primary/10 border-t border-primary/30",
    text: "",
    question: "text-center",
  };
}

// const prepareQuestion = (unit: ExtendedUnit, question: Variable, annotations: Annotation[]) => {
//   if (!question?.question) return <div />;
//   let preparedQuestion = question.question;

//   const regex = /{(.*?)}/g;
//   if (annotations.length > 0) {
//     // matchAll not yet supported by RStudio browser
//     //const matches = [...Array.from(preparedQuestion.matchAll(regex))];
//     //for (let m of matches) {
//     let m: RegExpExecArray | null;
//     while ((m = regex.exec(preparedQuestion))) {
//       const m0: string = m[0];
//       const m1: string = m[1];
//       let value;
//       if (unit.content.variables) {
//         value = unit.content.variables[m1];
//       }
//       value = annotations.find((a) => a.variable === m1)?.code || value;

//       if (value) {
//         preparedQuestion = preparedQuestion.replace(m0, "{" + value + "}");
//       }
//     }
//   }

//   return markedString(preparedQuestion);
// };

// const markedString = (text: string) => {
//   const regex = new RegExp(/{(.*?)}/); // Match text inside two curly brackets

//   text = text.replace(/(\r\n|\n|\r)/gm, "");
//   return (
//     <>
//       {text.split(regex).reduce((prev: (string | ReactElement)[], current: string, i: number) => {
//         if (i % 2 === 0) {
//           prev.push(current);
//         } else {
//           prev.push(
//             <mark key={i + current} style={{ color: "hsl(var(--primary-foreground))", backgroundColor: "transparent" }}>
//               {current}
//             </mark>,
//           );
//         }
//         return prev;
//       }, [])}
//     </>
//   );
// };

export default React.memo(QuestionForm);
