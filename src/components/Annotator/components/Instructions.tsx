import { useEffect, useState } from "react";
import { SessionData } from "../../../types";
import Markdown from "../../Common/components/Markdown";
import styled from "styled-components";
import { FaQuestionCircle } from "react-icons/fa";
import Modal from "../../Common/components/Modal";

const QuestionMarkButton = styled.span`
  vertical-align: middle;
  margin: 0.1em;
  font-size: 1em;
  padding: 0.6em;
  cursor: pointer;

  /* svg:hover {
    fill: var(--secondary);
  } */
`;

interface InstructionsProps {
  instruction: string;
  autoInstruction: boolean;
  sessionData: SessionData;
}

const Instructions = ({ instruction, autoInstruction, sessionData }: InstructionsProps) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!instruction) {
      setOpen(false);
      return;
    }
    if (autoInstruction) {
      if (!sessionData.seenInstructions[instruction]) setOpen(true);
      sessionData.seenInstructions[instruction] = true;
    }
  }, [instruction, autoInstruction, sessionData]);

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
    <>
      <Modal open={open} setOpen={setOpen} closeOnSelectKey>
        <Markdown
          style={{
            hyphens: "auto",
          }}
        >
          {instruction}
        </Markdown>
      </Modal>
      <QuestionMarkButton onClick={(e) => setOpen(!open)}>
        <FaQuestionCircle />
      </QuestionMarkButton>
    </>
  );
};

export default Instructions;
