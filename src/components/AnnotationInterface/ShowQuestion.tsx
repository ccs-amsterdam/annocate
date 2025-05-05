import { Annotation, AnnotationLibrary, CodebookPhase, Unit } from "@/app/types";
import React, { ReactElement, useMemo, useState } from "react";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import useWatchChange from "@/hooks/useWatchChange";
import { useSandbox } from "@/hooks/useSandboxedEval";
import Markdown from "../Common/Markdown";

interface ShowQuestionProps {
  unit: Unit;
  annotationLib: AnnotationLibrary;
  codebook: CodebookPhase;
}

const ShowQuestion = ({ unit, annotationLib, codebook }: ShowQuestionProps) => {
  const { evalStringWithJobState, ready } = useSandbox();
  const { jobState } = useUnit();
  const [questionText, setQuestionText] = useState("");
  const variable = annotationLib.variables?.[annotationLib.variableIndex];

  if (useWatchChange([variable.question, jobState, evalStringWithJobState, ready])) {
    setQuestionText("");
    if (ready) {
      evalStringWithJobState(variable.question, jobState).then(setQuestionText);
    }
  }

  if (!questionText) return null;
  return (
    <span className="min-h-8 text-left text-base">
      <Markdown compact style={variable.questionStyle}>
        {questionText}
      </Markdown>
    </span>
  );
};

export default React.memo(ShowQuestion);
