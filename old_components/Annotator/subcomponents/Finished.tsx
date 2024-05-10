import { useState, useEffect, CSSProperties } from "react";
import { QRCodeCanvas } from "qrcode.react";
import copyToClipboard from "@/functions/copyToClipboard";
import { Debriefing, JobServer } from "@/app/types";
import { useQuery } from "@tanstack/react-query";
import Markdown from "@/components/Common/Markdown";
import styled from "styled-components";
import { FaFlagCheckered } from "react-icons/fa";
import { Loader } from "@/styled/Styled";

const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: relative;
  padding: 2rem;
  line-height: 1.5em;

  font-size: 1.7rem;

  .Message {
    display: flex;
    gap: 2rem;
    justify-content: center;
    align-items: center;
  }

  p {
    text-align: left;
    max-width: 30em;
  }

  svg {
    color: hsl(var(--primary-foreground));
    font-size: 8rem;
    margin-bottom: 2rem;
  }

  a {
    color: hsl(var(--primary-foreground));
    text-decoration: underline;
    font-size: 1.2em;
    width: 100%;
    text-align: center;
    cursor: pointer;
  }
`;

interface FinishedProps {
  jobServer: JobServer;
}

const Finished = ({ jobServer }: FinishedProps) => {
  const debriefing = useQuery<Debriefing>(
    ["debriefing"],
    () => {
      return jobServer.getDebriefing();
    },
    {
      enabled: !!jobServer,
    },
  );

  if (!jobServer) return null;

  if (debriefing.isFetching)
    return (
      <StyledDiv>
        <Loader $active />
      </StyledDiv>
    );

  if (debriefing.data) {
    return (
      <StyledDiv>
        <div className="Message">
          <FaFlagCheckered />
          <Markdown>{debriefing.data.message}</Markdown>
        </div>
        <br />
        {debriefing.data.link ? (
          <a href={debriefing.data.link.replace("{user_id}", debriefing.data.user_id)} rel="noopener noreferrer">
            {debriefing.data.link_text || "Click here!"}
          </a>
        ) : null}
      </StyledDiv>
    );
  }

  return (
    <StyledDiv>
      <FaFlagCheckered />
    </StyledDiv>
  );
};

export default Finished;
