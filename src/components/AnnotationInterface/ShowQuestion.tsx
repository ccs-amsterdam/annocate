import { Annotation, AnnotationLibrary, ExtendedCodebook, ExtendedUnit, Variable } from "@/app/types";
import Markdown from "@/components/Common/Markdown";
import useSessionStorage from "@/hooks/useSessionStorage";
import { Info } from "lucide-react";
import hash from "object-hash";
import React, { ReactElement, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "../ui/drawer";

interface ShowQuestionProps {
  unit: ExtendedUnit;
  annotationLib: AnnotationLibrary;
  codebook: ExtendedCodebook;
}

///////// TODO
/// integrate questionindex step here. Gives more flexibility

const ShowQuestion = ({ unit, annotationLib, codebook }: ShowQuestionProps) => {
  const [open, setOpen] = useState(false);
  const variable = annotationLib.variables?.[annotationLib.variableIndex];
  const questionText = prepareQuestion(unit, variable, Object.values(annotationLib.annotations));
  const instruction = variable?.instruction || codebook?.settings?.instruction;
  const autoInstruction = true;

  const key = useMemo(() => {
    return hash({ instruction });
  }, [instruction]);

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

  if (!instruction) return <div className="mt-20">{questionText}</div>;

  return (
    <SurveyInstruction instruction={instruction} open={open} setOpen={setOpen}>
      {questionText}
    </SurveyInstruction>
  );

  return (
    <ModalInstruction instruction={instruction} open={open} setOpen={setOpen}>
      {questionText}
    </ModalInstruction>
  );
};

interface InstructionsProps {
  children: ReactElement;
  instruction: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}

function SurveyInstruction({ children, instruction, open, setOpen }: InstructionsProps) {
  return (
    <div className="flex  min-w-0 flex-col  px-9">
      {children}
      <div className="mt-12">
        <Markdown style={{ hyphens: "auto" }}>{instruction}</Markdown>
      </div>
    </div>
  );
}

function ModalInstruction({ children, instruction, open, setOpen }: InstructionsProps) {
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
    <Drawer
      direction="right"
      open={!!instruction && open}
      onOpenChange={(open) => {
        setOpen(!!instruction && open);
      }}
    >
      <DrawerTrigger className={`relative  px-9  ${instruction ? "cursor-pointer" : "cursor-default"}`}>
        {children}
        <Info
          className={`ml-3  inline-block h-5 
          w-5 opacity-80 ${instruction ? "" : "hidden"}`}
        />
      </DrawerTrigger>
      <DrawerContent className="fixed bottom-0 left-auto right-0   mt-0 h-screen w-[700px] max-w-[90vw] rounded-none  border-y-0 bg-background p-3  ">
        <div className="overflow-auto px-3">
          <div className="h-[10vh]" />
          <Markdown
            style={{
              hyphens: "auto",
            }}
          >
            {"\n\n\n\n" + instruction || ""}
          </Markdown>
          <div className="h-[10vh]" />
        </div>
        <DrawerClose className="mt-auto">
          <Button variant="outline" size="icon" className="mt-auto w-full bg-background/40 hover:bg-foreground/20">
            Close
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

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
