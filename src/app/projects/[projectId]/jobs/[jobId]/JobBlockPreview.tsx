import { useJobBlocks } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { GetUnit, JobState, Progress } from "@/app/types";
import { AnnotationInterface } from "@/components/AnnotationInterface/AnnotationInterface";
import JobServerDesign from "@/components/JobServers/JobServerDesign";
import { Button } from "@/components/ui/button";
import useWatchChange from "@/hooks/useWatchChange";
import { useMiddlecat } from "middlecat-react";
import React, { useEffect, useMemo } from "react";
import { useRef, useState } from "react";

interface Props {
  projectId: number;
  jobId: number;
}

type UnitCache = Record<number | string, Omit<GetUnit, "progress">>;

export function JobBlockPreview({ projectId, jobId }: Props) {
  const { user } = useMiddlecat();
  const { data: blocks, isLoading: blocksLoading } = useJobBlocks(projectId, jobId);

  const [mockServer, setMockServer] = useState<{ progress: Progress; jobState: JobState; unitCache: UnitCache }>({
    progress: initProgress(),
    jobState: initJobState(),
    unitCache: {},
  });

  useEffect(() => {}, [blocks]);

  const jobServer = useMemo(() => {
    if (!blocks || blocks.length === 0 || !user) return null;

    return new JobServerDesign({
      projectId,
      jobId,
      user,
      mockServer,
      jobBlocks: blocks || [],
    });
  }, [blocks, user, mockServer]);

  if (!jobServer) return null;

  return (
    <div>
      <PreviewWindow
        jobServer={jobServer}
        reset={() => {
          setMockServer({
            progress: initProgress(),
            jobState: initJobState(),
            unitCache: {},
          });
        }}
      />
    </div>
  );
}

function initJobState(): JobState {
  return {
    unitAnnotations: {},
    surveyAnnotations: {},
    unitData: {},
  };
}
function initProgress(): Progress {
  return {
    phase: 0,
    phasesCoded: 0,
    phases: [{ type: "survey", label: "" }],
    seekForwards: true,
    seekBackwards: true,
  };
}

export function PreviewWindow({ jobServer, reset }: { jobServer: JobServerDesign; reset: () => void }) {
  const [focus, setFocus] = useState(false);

  if (!jobServer) return null;

  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div
        tabIndex={0}
        className={`h-[600px] w-full max-w-full overflow-hidden rounded-lg border border-foreground/50 ${focus ? "ring-4 ring-secondary ring-offset-2" : ""}`}
        onClick={(e) => {
          e.currentTarget.focus();
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      >
        <AnnotationInterface jobServer={jobServer} blockEvents={!focus} />
      </div>
      <div className="flex max-w-full flex-col gap-3 pt-6">
        {/* <PreviewDataWindow previewData={previewData} /> */}
        <Button className="h-12" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

// function PreviewDataWindow({ previewData }: { previewData: GetJobState | null }) {
//   if (!previewData) return null;
//   const isSurvey = previewData.unit?.type === "survey";
//   return (
//     <div className="flex max-h-full flex-col overflow-auto rounded">
//       <div className={`${isSurvey ? "hidden" : ""} p-3`}>
//         <h3 className="mb-3">Unit data</h3>
//         <div className="grid grid-cols-[min-content,1fr] gap-x-3">
//           {Object.entries(previewData.unitData?.data || {}).map(([column, value]) => {
//             return (
//               <React.Fragment key={column}>
//                 <div className="text-primary">{column}</div>
//                 <div className="line-clamp-3 overflow-auto text-sm">{value}</div>
//               </React.Fragment>
//             );
//           })}
//         </div>
//       </div>
//       <div className="p-3">
//         <h3 className="mb-3">Survey answers</h3>
//         <div className="grid grid-cols-[min-content,1fr] gap-x-3">
//           {Object.entries(previewData.surveyAnnotations || {}).map(([variable, values]) => {
//             return (
//               <React.Fragment key={variable}>
//                 <div className="text-primary">{variable}</div>
//                 <div className="line-clamp-3 overflow-auto text-sm">
//                   {values.code} ({values.value})
//                 </div>
//               </React.Fragment>
//             );
//           })}
//         </div>
//       </div>
//       <div className={`${isSurvey ? "hidden" : ""} p-3`}>
//         <h3 className="mb-3">Current unit Annotations</h3>
//         <div className="grid grid-cols-[min-content,1fr] gap-x-3">
//           {(previewData.unit?.annotations || []).map((annotation) => {
//             return (
//               <React.Fragment key={annotation.id}>
//                 <div className="text-primary">{annotation.variable}</div>
//                 <div className="line-clamp-3 overflow-auto text-sm">
//                   {annotation.code} ({annotation.value})
//                 </div>
//               </React.Fragment>
//             );
//           })}
//         </div>
//       </div>
//       {/* <div>
//         <div className="p-3">Mapped content</div>
//         <pre className=" pl-3 text-primary">{JSON.stringify(previewData.unit?.content || "", undefined, 2)}</pre>
//       </div> */}
//     </div>
//   );
// }
