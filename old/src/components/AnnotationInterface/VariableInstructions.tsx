import { Annotation, AnnotationLibrary, CodebookPhase, CodebookVariable, Unit } from "@/app/types";
import Markdown from "@/components/Common/Markdown";
import useSessionStorage from "@/hooks/useSessionStorage";
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Info, InfoIcon, X } from "lucide-react";
import hash from "object-hash";
import React, { ReactElement, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from "../ui/drawer";
import { DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

interface VariableInstructionsProps {
  children?: ReactElement<any>;
  variable: CodebookVariable;
}

///////// TODO
/// integrate questionindex step here. Gives more flexibility

const VariableInstructions = ({ children, variable }: VariableInstructionsProps) => {
  const instruction = variable?.instruction;

  const sessionVariableKey = variable.name;
  const showOnMount = variable.instructionAuto;
  const [show, setShow] = useSessionStorage(sessionVariableKey, showOnMount);

  if (!instruction) return <div className="">{children}</div>;

  const question = (
    <div
      tabIndex={0}
      // is="button"
      // onClick={() => setShow(!show)}
      className={`relative z-50 w-full text-pretty`}
    >
      {children}
    </div>
  );

  return (
    <div className="flex flex-col">
      {question}
      <ModalInstruction instruction={instruction} show={show} setShow={setShow} />
      <Button
        onClick={() => setShow(!show)}
        variant="ghost"
        size="icon"
        className="flex h-6 w-full justify-center hover:bg-transparent"
      >
        <InfoIcon className="p-[3px] text-primary-foreground/70" />
      </Button>
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

function getFoldStyle(ref: React.RefObject<HTMLDivElement | null>, before?: boolean) {
  if (!ref.current) return {};

  const height = ref.current?.scrollHeight;
  return { maxHeight: `${height}px` };
}

function FoldableInstruction({ instruction, show, setShow, foldable, before }: InstructionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState(() => getFoldStyle(ref, before));

  useEffect(() => {
    setStyle(getFoldStyle(ref, before));
    if (!show) return;

    const interval = setInterval(() => {
      setStyle(getFoldStyle(ref, before));
    }, 1000);
    return () => clearInterval(interval);
  }, [show, ref, before]);

  const icon = show ? <EyeOff /> : <Info />;

  return (
    <div
      style={style}
      className={`${show ? "" : "text-foreground"} flexmin-w-0 relative overflow-visible transition-all`}
    >
      <div onClick={() => setShow(!show)} ref={ref} className={` ${show ? "py-1" : ""} w-full overflow-hidden`}>
        {show ? (
          <Markdown compact style={{ hyphens: "auto", visibility: show ? "visible" : "hidden" }}>
            {instruction + (foldable ? " &nbsp;&nbsp;&#x2718;" : "")}
          </Markdown>
        ) : (
          <Button
            onClick={() => setShow(!show)}
            variant="ghost"
            size="icon"
            className="flex h-6 w-full justify-center hover:bg-transparent"
          >
            <InfoIcon className="p-[3px] text-foreground/70" />
          </Button>
        )}
      </div>
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
      <DrawerContent className="fixed bottom-0 left-auto right-0 mt-0 h-screen w-[500px] max-w-[90vw] rounded-none border-y-0 bg-background p-3">
        <DrawerClose asChild className="mt-autod ml-auto mt-2">
          <Button variant="ghost" size="icon" className="absolute top-0 mb-auto ml-auto bg-transparent">
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
          <Button variant="default" className="mt-auto w-full hover:bg-foreground/20">
            Close
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

export default React.memo(VariableInstructions);
