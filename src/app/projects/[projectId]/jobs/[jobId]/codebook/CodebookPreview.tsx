import { useCodebookNodes } from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { CodebookNode, GetUnitCache } from "@/app/types";
import { AnnotationInterface } from "@/components/AnnotationInterface/AnnotationInterface";
import JobServerDesign from "@/classes/JobServerDesign";
import { Button } from "@/components/ui/button";
import { SquareCheckIcon, SquareIcon } from "lucide-react";
import { useMiddlecat } from "middlecat-react";
import { useMemo } from "react";
import { useState } from "react";
import { ZodError } from "zod";
import { MockServer, ServerAnnotations } from "@/classes/MockServer";

interface Props {
  projectId: number;
  jobId: number;
  preview?: CodebookNode | ZodError;
}

type UnitCache = Record<number | string, Omit<GetUnitCache, "progress">>;

export function CodebookPreview({ projectId, jobId, preview }: Props) {
  const { user } = useMiddlecat();
  const { data: codebookNodes, isLoading: codebookLoading } = useCodebookNodes(projectId, jobId);
  const [annotations, setAnnotations] = useState<ServerAnnotations>({ global: {} });

  const reset = () => setAnnotations({ global: {} });

  const jobServer = useMemo(() => {
    if (!codebookNodes || codebookNodes.length === 0 || !user) return null;

    const codebook = createPreviewPhase(codebookNodes, preview);
    if (!codebook) return null;

    const mockServer = new MockServer({ codebook, annotations });

    return new JobServerDesign({
      projectId,
      jobId,
      user,
      mockServer,
      previewMode: !!preview,
    });
  }, [codebookNodes, user, annotations, preview]);

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
      <PreviewWindow mode={mode} jobServer={jobServer} reset={reset} />
    </div>
  );
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

  return (
    <div className="flex flex-wrap items-start justify-center gap-3">
      <div className={`${mode === "changes" ? "hidden" : ""} flex h-10 w-full items-center rounded`}>
        <h4>Job preview</h4>
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
        className={`h-[600px] w-full max-w-full overflow-hidden rounded-lg ${!blockEvents ? "ring-4 ring-secondary ring-offset-2" : ""}`}
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
  codebookNodes: CodebookNode[],
  codebookNode: CodebookNode | ZodError | undefined,
): CodebookNode[] | null {
  if (codebookNode === undefined) return codebookNodes;
  if (codebookNode instanceof ZodError) return null;
  if (codebookNode.data.type === "Survey phase") return null;

  const nodes = addParentNodes(codebookNodes, codebookNode);
  if (codebookNode.data.type === "Annotation phase")
    nodes.push({
      id: 0,
      name: "dummy",
      parentPath: [],
      children: [],
      treeType: "leaf",
      phaseId: 0,
      phaseType: "annotation",
      parentId: codebookNode.id,
      position: 0,
      dependencies: {},
      data: {
        type: "Question",
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

function addParentNodes(codebookNodes: CodebookNode[], codebookNode: CodebookNode): CodebookNode[] {
  // if a preview node is given, we need to trace back it's
  // parent nodes to simulate how it would look like in the context
  // of the job.
  const parentIndex = codebookNodes.findIndex((b) => b.id === codebookNode.parentId);
  if (parentIndex === -1) return [codebookNode];
  const parent = { ...codebookNodes[parentIndex], position: 0 };
  return [...addParentNodes(codebookNodes, parent), codebookNode];
}
