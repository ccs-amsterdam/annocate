import { useListJobBlockContent } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { GetJobState, GetUnit, Progress } from "@/app/types";
import JobServerDesign from "@/components/JobServers/JobServerDesign";
import useWatchChange from "@/hooks/useWatchChange";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";

interface Props {
  projectId: number;
  jobId: number;
}

export function JobBlockPreview({ projectId, jobId }: Props) {
  const { user } = useMiddlecat();

  // try doing this with just the tree instead of all jobblockcontent
  // we might need to do the same in the real jobBlock to fetch the
  // root blocks separately
  const jobBlocks = useListJobBlockContent(projectId, jobId);

  const [progress, setProgress] = useState<Progress>({
    phase: "preSurvey",
    currentUnit: 0,
    nCoded: 0,
    nTotal: 0,
  });
  const [unitCache, setUnitCache] = useState<Record<string, Omit<GetUnit, "progress">>>({});
  const [jobState, setJobState] = useState<GetJobState>({
    unitAnnotations: {},
    surveyAnnotations: {},
    blocks: [],
  });
  const [jobServer, setJobServer] = useState<JobServerDesign | null>(null);

  if (useWatchChange([projectId, jobId, user, jobBlocks.data])) {
    if (!jobBlocks.isLoading && user) {
      setJobServer(
        new JobServerDesign({
          projectId,
          jobId,
          initialJobState: jobState,
          setJobState,
          user,
          mockServer: { progress, setProgress, unitCache, setUnitCache },
          jobBlocks: jobBlocks.data || [],
          unitLayout: { type: "grid", rows: 1, cols: 1 },
        }),
      );
    }
  }

  if (!jobServer) return <div>Loading...</div>;

  return (
    <div>
      <h1>SingleBlockPreview</h1>
    </div>
  );
}
