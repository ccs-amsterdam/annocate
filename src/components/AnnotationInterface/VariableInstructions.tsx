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

  if (!instruction) return <div className="">{children}</div>;

  const mode = variable?.instructionMode || "after";
  const foldable = codebook.type !== "survey";

  if (mode === "after") {
    return (
      <div className="">
        {children}
        <FoldableInstruction instruction={instruction} foldable={foldable} />
      </div>
    );
  }
  if (mode === "before") {
    return (
      <div className="mb-1">
        <FoldableInstruction instruction={instruction} foldable={foldable} before={true} />
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {children}
      <ModalInstruction instruction={instruction} autoInstruction={mode.includes("auto")} />
    </div>
  );
};

interface InstructionsProps {
  instruction: string;
  autoInstruction?: boolean;
  foldable?: boolean;
  before?: boolean;
}

function getFoldStyle(show: boolean, ref: React.RefObject<HTMLDivElement>, before?: boolean) {
  if (!ref.current) return {};
  if (!show) return { maxHeight: before ? "0px" : "20px" };

  const height = ref.current?.scrollHeight;
  return { maxHeight: `${height}px` };
}

function FoldableInstruction({ instruction, foldable, before }: InstructionsProps) {
  const [show, setShow] = useState(true);
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

  const icon = show ? <X className="h-5 w-5 " /> : <Info className="h-5 w-5 " />;

  return (
    <div
      style={style}
      className={`${show ? "my-2" : "text-foreground"}  relative flex  min-w-0  overflow-visible   transition-all`}
    >
      <div ref={ref} className={`  ${show ? "py-1" : "py-3"} w-full overflow-hidden px-9  `}>
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
        className={` 
          ${foldable ? "" : "hidden"} 
          ${before && !show ? "-translate-y-6" : ""} 
          ${!before && !show ? "translate-y-1" : ""}
          absolute right-0 z-30 h-full rounded px-2 text-foreground text-inherit transition-all hover:bg-transparent hover:text-inherit`}
      >
        <div className="flex gap-2">{icon}</div>
      </Button>
    </div>
  );
}

function ModalInstruction({ instruction, autoInstruction }: InstructionsProps) {
  const [open, setOpen] = useState(false);
  const key = useMemo(() => {
    return hash({ instruction });
  }, [instruction]);
  const [seen, setSeen] = useSessionStorage(key, false);

  useEffect(() => {
    if (autoInstruction) {
      if (!seen) {
        setOpen(true);
        setSeen(true);
      }
    }
  }, [autoInstruction, seen, setSeen]);

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
      modal={false}
      direction="right"
      open={!!instruction && open}
      onOpenChange={(open) => {
        setOpen(!!instruction && open);
      }}
    >
      <DrawerTrigger className={`relative ml-auto   cursor-pointer px-2`}>
        <Info className={`ml-auto  inline-block h-5  w-5 `} />
      </DrawerTrigger>
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
