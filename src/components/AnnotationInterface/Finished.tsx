import { useState, useEffect, CSSProperties } from "react";
import { QRCodeCanvas } from "qrcode.react";
import copyToClipboard from "@/functions/copyToClipboard";
import { Debriefing, JobServer } from "@/app/types";
import { useQuery } from "@tanstack/react-query";
import Markdown from "@/components/Common/Markdown";
import { FaFlagCheckered } from "react-icons/fa";
import { Loading } from "../ui/loader";
import { Flag } from "lucide-react";

interface FinishedProps {
  jobServer: JobServer;
}

const Finished = ({ jobServer }: FinishedProps) => {
  const debriefing = useQuery({
    queryKey: ["debriefing"],
    queryFn: async (): Promise<Debriefing | null> => {
      return jobServer.getDebriefing ? jobServer.getDebriefing() : null;
    },
    enabled: !!jobServer,
  });

  if (!jobServer) return null;

  if (debriefing.isFetching) return <Loading />;

  if (debriefing.data) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center p-4 text-lg leading-3">
        <div className="flex items-center justify-center gap-6">
          <Flag size={128} />
          <Markdown>{debriefing.data.message || ""}</Markdown>
        </div>
        <br />
        {debriefing.data.link ? (
          <a href={debriefing.data.link.replace("{user_id}", debriefing.data.user_id || "")} rel="noopener noreferrer">
            {debriefing.data.link_text || "Click here!"}
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="leading-2 relative flex h-full w-full flex-col items-center justify-center p-3">
      <FaFlagCheckered size={128} />
    </div>
  );
};

export default Finished;
