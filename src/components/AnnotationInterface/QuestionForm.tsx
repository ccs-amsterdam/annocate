import { Annotation, AnnotationLibrary, Codebook, ExtendedCodebook, ExtendedUnit, Variable } from "@/app/types";
import AnnotationManager from "@/functions/AnnotationManager";
import overflowBordersEvent from "@/functions/overflowBordersEvent";
import React, { ReactElement, useEffect, useMemo, useRef } from "react";
import AnswerField from "./AnswerField";
import QuestionIndexStep from "./QuestionIndexStep";
import ShowQuestion from "./ShowQuestion";
import Markdown from "../Common/Markdown";

interface QuestionFormProps {
  unit: ExtendedUnit;
  codebook: ExtendedCodebook;
  annotationLib: AnnotationLibrary;
  annotationManager: AnnotationManager;
  blockEvents: boolean;
}

const QuestionForm = ({ unit, codebook, annotationLib, annotationManager, blockEvents }: QuestionFormProps) => {
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

  return (
    <div
      ref={questionRef}
      className={`${TypeStyling[codebook.type].container} relative z-30 flex  flex-col   text-[length:inherit]  transition-[border]  `}
    >
      <div className=" z-40 flex w-full flex-col ">
        <QuestionIndexStep
          variables={annotationLib.variables}
          variableIndex={annotationLib.variableIndex}
          variableStatuses={annotationLib.variableStatuses}
          setQuestionIndex={(index: number) => annotationManager.setVariableIndex(index)}
        >
          <div
            className={`relative z-20 mb-1 flex flex-auto items-center justify-center bg-background py-3 text-[length:inherit] `}
          >
            <div className={`flex items-center justify-center gap-3 text-lg `}>
              <ShowQuestion unit={unit} annotationLib={annotationLib} codebook={codebook} />
            </div>
          </div>
        </QuestionIndexStep>
      </div>

      {/* {codebook.type === "survey" ? (
        <div className="px-9">
          <Markdown>{variable.instruction}</Markdown>
        </div>
      ) : null} */}

      <div className="relative flex w-full flex-auto overflow-auto  text-[length:inherit] text-foreground">
        <AnswerField annotationLib={annotationLib} annotationManager={annotationManager} blockEvents={blockEvents} />
      </div>
    </div>
  );
};

const TypeStyling = {
  survey: {
    container: "text-foreground bg-background min-h-[60%]",
  },
  annotation: {
    container: "border-primary-dark border-t- text-foreground bg-gradient-to-t from-primary-dark/10 to-primary/10",
  },
};

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
