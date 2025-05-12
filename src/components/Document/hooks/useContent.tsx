import { Doc } from "@/app/types";
import { useJobContext } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { processUnitContent } from "@/components/AnnotatorProvider/unitProcessing";
import { useSandbox } from "@/hooks/useSandboxedEval";
import { useEffect, useState } from "react";

export function useContent() {
  const jobContext = useJobContext();
  const { unit, variableMap, layouts, progress } = jobContext;
  const { evalStringWithJobContext } = useSandbox();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Doc | null>(null);

  useEffect(() => {
    if (!unit) return;

    const variableId = progress.phases[progress.current.phase].variables[progress.current.variable].id;
    const variable = variableMap[variableId];

    if (variable.layoutId === undefined) {
      setContent(null);
      return;
    }

    const layout = layouts[variable.layoutId];

    // setLoading(true)
    processUnitContent({ unit, layout, evalStringWithJobContext, jobContext })
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
  }, [unit, layouts, progress]);

  return { loading, content };
}
