import { ReactElement, useEffect, useMemo, useState } from "react";
import {
  Annotation,
  AnnotationLibrary,
  Codebook,
  ExtendedCodebook,
  SessionData,
  ExtendedUnit,
  Variable,
} from "@/app/types";
import Markdown from "@/components/Common/Markdown";
import styled from "styled-components";
import { FaQuestionCircle } from "react-icons/fa";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import useSessionStorage from "@/hooks/useSessionStorage";
import hash from "object-hash";
import { Info } from "lucide-react";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import React from "react";

interface InstructionsProps {
  unit: ExtendedUnit;
  annotationLib: AnnotationLibrary;
  codebook: Codebook;
}

const ShowQuestion = ({ unit, annotationLib, codebook }: InstructionsProps) => {
  const [open, setOpen] = useState(false);
  const variable = annotationLib.variables?.[annotationLib.variableIndex];
  const questionText = prepareQuestion(unit, variable, Object.values(annotationLib.annotations));
  const instruction = variable?.instruction || codebook?.settings?.instruction;
  const autoInstruction = codebook?.settings?.auto_instruction;

  const key = useMemo(() => {
    return hash({ instruction });
  }, [instruction]);
  const [seen, setSeen] = useSessionStorage(key, false);

  useEffect(() => {
    if (!instruction) {
      setOpen(false);
      return;
    }
    if (autoInstruction) {
      if (!seen) {
        setOpen(true);
        setSeen(true);
      }
    }
  }, [instruction, autoInstruction, seen, setSeen]);

  useEffect(() => {
    if (!open) return;
    const stopPropagation = (e: any) => open && e.stopPropagation();
    const stopWhat = ["keydown", "keyup"];
    for (const what of stopWhat) document.addEventListener(what, stopPropagation);
    return () => {
      for (const what of stopWhat) document.removeEventListener(what, stopPropagation);
    };
  }, [open]);

  return (
    <Dialog
      open={!!instruction && open}
      onOpenChange={(open) => {
        setOpen(!!instruction && open);
      }}
    >
      <DialogTrigger className={`relative  ${instruction ? "cursor-pointer" : "cursor-default"}`}>
        {questionText}
        <Info className={` absolute -right-4 -top-2  h-4 w-4 opacity-80 ${instruction ? "" : "hidden"}`} />
      </DialogTrigger>
      <DialogContent className="prose w-[90vw] max-w-[800px] dark:prose-invert">
        <Markdown
          style={{
            hyphens: "auto",
          }}
        >
          {instruction || ""}
        </Markdown>
      </DialogContent>
    </Dialog>
  );
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
      if (unit.content.variables) {
        value = unit.content.variables[m1];
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
