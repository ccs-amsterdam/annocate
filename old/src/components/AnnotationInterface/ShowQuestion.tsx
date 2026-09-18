import { Annotation, AnnotationLibrary, CodebookPhase, CodebookVariable, Unit } from "@/app/types";
import React, { ReactElement, useMemo, useState } from "react";
import { useJobContext } from "../AnnotatorProvider/AnnotatorProvider";
import useWatchChange from "@/hooks/useWatchChange";
import { useSandbox } from "@/hooks/useSandboxedEval";
import Markdown from "../Common/Markdown";

interface ShowQuestionProps {
  variable: CodebookVariable;
}

const ShowQuestion = ({ variable }: ShowQuestionProps) => {
  const { evalStringWithJobContext: evalStringWithJobState, ready } = useSandbox();
  const jobContext = useJobContext();
  const [questionText, setQuestionText] = useState("");

  if (useWatchChange([variable.question, jobContext, evalStringWithJobState, ready])) {
    setQuestionText("");
    if (ready) {
      evalStringWithJobState(variable.question, jobContext).then(setQuestionText);
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
