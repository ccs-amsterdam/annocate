import { Doc } from "@/app/types";
import { useJobContext } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { processUnitContent } from "@/components/AnnotatorProvider/unitProcessing";
import { useSandbox } from "@/hooks/useSandboxedEval";
import { useEffect, useState } from "react";

export function useContent() {
  const jobContext = useJobContext();
  const { unit, codebook, progress } = jobContext;
  const { evalStringWithJobContext } = useSandbox();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Doc | null>(null);

  useEffect(() => {
    if (!unit) return;

    const phaseProgress = progress.phases[progress.currentPhase];
    const variable = codebook.phases[progress.currentPhase].variables[phaseProgress.currentVariable];

    if (variable.layout === undefined) {
      setContent(null);
      return;
    }

    // setLoading(true)
    processUnitContent({ unit, layout: variable.layout, evalStringWithJobContext, jobContext })
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
  }, [unit, codebook, progress]);

  return { loading, content };
}
