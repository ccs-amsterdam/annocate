import { useCodebookNodes } from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { GetUnit, CodebookNodesResponse, JobState, Progress } from "@/app/types";
import { AnnotationInterface } from "@/components/AnnotationInterface/AnnotationInterface";
import JobServerDesign from "@/components/JobServers/JobServerDesign";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useDarkMode } from "@/hooks/useDarkMode";
import useWatchChange from "@/hooks/useWatchChange";
import { SquareCheckIcon, SquareIcon } from "lucide-react";
import { useMiddlecat } from "middlecat-react";
import React, { useEffect, useMemo } from "react";
import { useRef, useState } from "react";
import { ZodError } from "zod";
import { fromError } from "zod-validation-error";

interface Props {
  projectId: number;
  jobId: number;
  preview?: CodebookNodesResponse | ZodError;
}

type UnitCache = Record<number | string, Omit<GetUnit, "progress">>;

export function CodebookNodePreview({ projectId, jobId, preview }: Props) {
  const { user } = useMiddlecat();
  const { data: codebookNodes, isLoading: codebookLoading } = useCodebookNodes(projectId, jobId);

  const [mockServer, setMockServer] = useState<{ progress: Progress; jobState: JobState; unitCache: UnitCache }>({
    progress: initProgress(),
    jobState: initJobState(),
    unitCache: {},
  });

  const jobServer = useMemo(() => {
    if (!codebookNodes || codebookNodes.length === 0 || !user) return null;

    const codebookPhase = createPreviewPhase(codebookNodes, preview);
    if (!codebookPhase) return null;

    return new JobServerDesign({
      projectId,
      jobId,
      user,
      mockServer,
      codebookNodes: codebookPhase,
      previewMode: !!preview,
    });
  }, [codebookNodes, user, mockServer, preview]);

  if (preview instanceof ZodError) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div>Solve validation errors to show preview</div>
      </div>
    );
  }

  if (!jobServer) return null;

  const mode = preview ? "changes" : "job";

  return (
    <div>
      <PreviewWindow
        mode={mode}
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
    annotations: {},
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

export function PreviewWindow({
  mode,
  jobServer,
  reset,
}: {
  mode: "changes" | "job";
  jobServer: JobServerDesign;
  reset: () => void;
}) {
  const [blockEvents, setBlockEvents] = useState(true);
  const [freeNav, setFreeNav] = useState(false);

  if (!jobServer) return null;
  const title = mode === "changes" ? "Preview of changes" : "Job preview";

  return (
    <div className="flex flex-wrap items-start justify-center gap-3">
      <div className="flex h-10 w-full items-center rounded">
        <h4>{title}</h4>
        {/* <PreviewDataWindow previewData={previewData} /> */}
        <div className={`${mode === "job" ? "" : "hidden"} ml-auto flex`}>
          <Button
            variant="ghost"
            className="ml-auto flex gap-3 hover:bg-transparent"
            onClick={() => {
              if (freeNav) reset();
              setFreeNav(!freeNav);
            }}
          >
            Can skip
            {freeNav ? <SquareCheckIcon /> : <SquareIcon />}
          </Button>
          <Button variant="ghost" className="hover:bg-transparent" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>
      <div
        tabIndex={0}
        className={`h-[600px] w-full max-w-full overflow-hidden rounded-lg border border-primary/20 ${!blockEvents ? "ring-4 ring-secondary ring-offset-2" : ""}`}
        onClick={(e) => {
          e.currentTarget.focus();
        }}
        onFocus={() => setBlockEvents(false)}
        onBlur={() => setBlockEvents(true)}
      >
        <AnnotationInterface jobServer={jobServer} blockEvents={blockEvents} />
      </div>
    </div>
  );
}

function createPreviewPhase(
  codebookNodes: CodebookNodesResponse[],
  codebookNode: CodebookNodesResponse | ZodError | undefined,
): CodebookNodesResponse[] | null {
  if (codebookNode === undefined) return codebookNodes;
  if (codebookNode instanceof ZodError) return null;
  if (codebookNode.data.type === "Survey phase") return null;

  const nodes = addParentNodes(codebookNodes, codebookNode);
  if (codebookNode.data.type === "Annotation phase")
    nodes.push({
      id: 0,
      name: "dummy",
      level: 0,
      children: 0,
      parentId: codebookNode.id,
      position: 0,
      data: {
        type: "Question task",
        variable: {
          type: "select code",
          question: "Preview of unit layout",
          questionStyle: { fontSize: "16px", textAlign: "center" },
          codes: [{ code: "go to next unit" }],
        },
      },
    });
  return nodes;
}

function addParentNodes(
  codebookNodes: CodebookNodesResponse[],
  codebookNode: CodebookNodesResponse,
): CodebookNodesResponse[] {
  // if a preview node is given, we need to trace back it's
  // parent nodes to simulate how it would look like in the context
  // of the job.
  const parentIndex = codebookNodes.findIndex((b) => b.id === codebookNode.parentId);
  if (parentIndex === -1) return [codebookNode];
  const parent = { ...codebookNodes[parentIndex], position: 0 };
  return [...addParentNodes(codebookNodes, parent), codebookNode];
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
