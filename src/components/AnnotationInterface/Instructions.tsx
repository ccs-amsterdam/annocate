import { useEffect, useMemo, useState } from "react";
import { SessionData } from "@/app/types";
import Markdown from "@/components/Common/Markdown";
import styled from "styled-components";
import { FaQuestionCircle } from "react-icons/fa";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import useSessionStorage from "@/hooks/useSessionStorage";
import hash from "object-hash";

const QuestionMarkButton = styled.span`
  vertical-align: middle;
  margin: 0.1em;
  font-size: 1em;
  padding: 0.6em;
  cursor: pointer;

  /* svg:hover {
    fill: hsl(var(--secondary));
  } */
`;

interface InstructionsProps {
  instruction: string | undefined;
  autoInstruction: boolean;
}

const Instructions = ({ instruction, autoInstruction }: InstructionsProps) => {
  const [open, setOpen] = useState(false);

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
    const stopPropagation = (e: any) => open && e.stopPropagation();
    const stopWhat = ["keydown", "keyup"];
    for (const what of stopWhat) document.addEventListener(what, stopPropagation);
    return () => {
      for (const what of stopWhat) document.removeEventListener(what, stopPropagation);
    };
  }, [open]);

  if (!instruction) return null;

  return (
    <Dialog>
      <DialogTrigger>
        <FaQuestionCircle />
      </DialogTrigger>
      <DialogContent className="prose dark:prose-invert w-[90vw] max-w-[800px]">
        <Markdown
          style={{
            hyphens: "auto",
          }}
        >
          {instruction}
        </Markdown>
      </DialogContent>
    </Dialog>
  );
};

export default Instructions;
