import { Annotation, AnnotationLibrary, ExtendedCodebook, ExtendedUnit, ExtendedVariable, Variable } from "@/app/types";
import Markdown from "@/components/Common/Markdown";
import useSessionStorage from "@/hooks/useSessionStorage";
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Info, X } from "lucide-react";
import hash from "object-hash";
import React, { ReactElement, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface VariableInstructionsProps {
  children: ReactElement;
  unit: ExtendedUnit;
  annotationLib: AnnotationLibrary;
  codebook: ExtendedCodebook;
}

///////// TODO
/// integrate questionindex step here. Gives more flexibility

const VariableInstructions = ({ children, unit, annotationLib, codebook }: VariableInstructionsProps) => {
  const variable = annotationLib.variables?.[annotationLib.variableIndex];
  const instruction = variable?.instruction || codebook?.settings?.instruction;

  const mode = variable?.instructionMode || "after";
  const survey = codebook.type === "survey";
  const foldable = !survey || mode.includes("modal");

  const sessionVariableKey = annotationLib.sessionId + "." + variable.name;
  const showOnMount = mode !== "modal";
  const [show, setShow] = useSessionStorage(sessionVariableKey, showOnMount);

  if (!instruction) return <div className="">{children}</div>;

  const questionWithButton = (
    <div is="button" tabIndex={0} onClick={() => setShow(!show)} className={` z-50 cursor-pointer text-pretty  `}>
      {children}
      <Button
        variant={"ghost"}
        size={"icon"}
        className={`${foldable ? "" : "hidden"} ${show ? "hidden" : ""} h-4 rounded bg-transparent text-inherit opacity-60 transition-all hover:bg-transparent hover:text-inherit`}
      >
        <Info className="h-5  w-5 translate-y-1" />
      </Button>
    </div>
  );

  if (mode === "after") {
    return (
      <div className="">
        {questionWithButton}
        {survey ? <br /> : null}
        <FoldableInstruction instruction={instruction} show={!foldable || show} setShow={setShow} foldable={foldable} />
      </div>
    );
  }
  if (mode === "before") {
    return (
      <div className="">
        <FoldableInstruction instruction={instruction} show={!foldable || show} setShow={setShow} foldable={foldable} />
        {survey ? <br /> : null}
        {questionWithButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {questionWithButton}
      <ModalInstruction instruction={instruction} show={show} setShow={setShow} />
    </div>
  );
};

interface InstructionProps {
  instruction: string;
  show: boolean;
  setShow: (show: boolean) => void;
  before?: boolean;
  foldable?: boolean;
}

function getFoldStyle(show: boolean, ref: React.RefObject<HTMLDivElement>, before?: boolean) {
  if (!ref.current) return {};
  if (!show) return { maxHeight: "0px" };

  const height = ref.current?.scrollHeight;
  return { maxHeight: `${height}px` };
}

function FoldableInstruction({ instruction, show, setShow, foldable, before }: InstructionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState(() => getFoldStyle(show, ref, before));

  useEffect(() => {
    setStyle(getFoldStyle(show, ref, before));
    if (!show) return;

    const interval = setInterval(() => {
      setStyle(getFoldStyle(show, ref, before));
    }, 1000);
    return () => clearInterval(interval);
  }, [show, ref, before]);

  const icon = show ? <EyeOff /> : <Info />;

  return (
    <div
      style={style}
      className={`${show ? "my-2" : "text-foreground"}  relative flex  min-w-0  overflow-visible   transition-all`}
    >
      <div ref={ref} className={`  ${show ? "py-1" : ""} w-full overflow-hidden   `}>
        {show ? (
          <Markdown compact style={{ hyphens: "auto", visibility: show ? "visible" : "hidden" }}>
            {instruction}
          </Markdown>
        ) : (
          <div className="hidden w-full border-t border-primary "></div>
        )}
      </div>
      <Button
        onClick={() => setShow(!show)}
        variant="ghost"
        size="icon"
        className={` 
          ${show ? "" : "hidden"}
          ${foldable ? "" : "hidden"} 
          ${before && !show ? "-translate-y-5" : ""} 
          ${!before && !show ? "translate-y-2" : ""}
          absolute -right-10 z-50 h-full w-9 rounded px-2 text-primary-foreground/60 transition-all hover:bg-transparent hover:text-inherit`}
      >
        <div className="">{icon}</div>
      </Button>
    </div>
  );
}

function ModalInstruction({ instruction, show, setShow }: InstructionProps) {
  useEffect(() => {
    if (!show) return;
    const stopPropagation = (e: any) => show && e.stopPropagation();
    const stopWhat = ["keydown", "keyup"];
    for (const what of stopWhat) document.addEventListener(what, stopPropagation);
    return () => {
      for (const what of stopWhat) document.removeEventListener(what, stopPropagation);
    };
  }, [show]);

  return (
    <Drawer
      modal={true}
      direction="right"
      open={show}
      onOpenChange={(open) => {
        setShow(!!instruction && open);
      }}
    >
      <DrawerContent className="fixed bottom-0 left-auto right-0 mt-0   h-screen w-[500px] max-w-[90vw] rounded-none border-y-0  bg-background  p-3  ">
        <DrawerClose asChild className="mt-autod ml-auto mt-2 ">
          <Button variant="ghost" size="icon" className="absolute top-0 mb-auto ml-auto  bg-transparent">
            <X className="h-5 w-5" />
          </Button>
        </DrawerClose>
        <DialogHeader className="invisible h-0">
          <DialogTitle>Instructions</DialogTitle>
          <DialogDescription>Instructions</DialogDescription>
        </DialogHeader>
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
        <DrawerClose asChild className="mt-auto">
          <Button variant="default" className="mt-auto w-full  hover:bg-foreground/20">
            Close
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

export default React.memo(VariableInstructions);
