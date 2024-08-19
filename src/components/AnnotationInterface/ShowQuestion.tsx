import { Annotation, AnnotationLibrary, ExtendedCodebook, ExtendedUnit, Variable } from "@/app/types";
import React, { ReactElement } from "react";

interface ShowQuestionProps {
  unit: ExtendedUnit;
  annotationLib: AnnotationLibrary;
  codebook: ExtendedCodebook;
}

const ShowQuestion = ({ unit, annotationLib, codebook }: ShowQuestionProps) => {
  const variable = annotationLib.variables?.[annotationLib.variableIndex];
  const questionText = prepareQuestion(unit, variable, Object.values(annotationLib.annotations));

  return <div className="min-h-8">{questionText}</div>;
};

const prepareQuestion = (unit: ExtendedUnit, question: Variable, annotations: Annotation[]) => {
  if (!question?.question) return <div />;
  let preparedQuestion = question.question;

  const regex = /{(.*?)}/g;
  if (annotations.length > 0) {
    // matchAll not yet supported by RStudio browser
    //const matches = [...Array.from(preparedQuestion.matchAll(regex))];
    //for (let m of matches) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(preparedQuestion))) {
      const m0: string = m[0];
      const m1: string = m[1];
      let value;
      if (unit.content.meta) {
        value = unit.content.meta[m1];
      }
      value = annotations.find((a) => a.variable === m1)?.code || value;

      if (value) {
        preparedQuestion = preparedQuestion.replace(m0, "{" + value + "}");
      }
    }
  }

  return markedString(preparedQuestion);
};

const markedString = (text: string) => {
  const regex = new RegExp(/{(.*?)}/); // Match text inside two curly brackets

  text = text.replace(/(\r\n|\n|\r)/gm, "");
  return (
    <>
      {text.split(regex).reduce((prev: (string | ReactElement)[], current: string, i: number) => {
        if (i % 2 === 0) {
          prev.push(current);
        } else {
          prev.push(
            <mark key={i + current} style={{ color: "hsl(var(--primary-foreground))", backgroundColor: "transparent" }}>
              {current}
            </mark>,
          );
        }
        return prev;
      }, [])}
    </>
  );
};

export default React.memo(ShowQuestion);
