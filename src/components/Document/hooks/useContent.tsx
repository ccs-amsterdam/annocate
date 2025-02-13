import { Doc } from "@/app/types";
import { useUnit } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { processUnitContent } from "@/components/AnnotatorProvider/unitProcessing";
import { useSandbox } from "@/hooks/useSandboxedEval";
import { useEffect, useState } from "react";

export function useContent() {
  const { unit, annotationLib, annotationManager, jobState } = useUnit();
  const { evalStringWithJobState } = useSandbox();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Doc | null>(null);

  useEffect(() => {
    const variable = annotationLib.variables[annotationLib.variableIndex];
    if (variable.layout === undefined) {
      setContent(null);
      return;
    }

    processUnitContent({ unit, layout: variable.layout, evalStringWithJobState, jobState })
      .then((content: Doc) => {
        setContent(content);
      })
      .catch((e) => {
        setContent(null);
        console.log(e);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [unit, annotationLib]);

  return { loading, content };
}
