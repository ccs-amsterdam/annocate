import { Annotation, Codebook, GetJobState, Job, Layout, Unit, UnitData } from "@/app/types";
import useLocalStorage from "@/hooks/useLocalStorage";
import useWatchChange from "@/hooks/useWatchChange";
import { useMiddlecat } from "middlecat-react";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { AnnotationInterface } from "../AnnotationInterface/AnnotationInterface";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import JobServerPreview from "../JobServers/JobServerPreview";
import { Slider } from "../ui/slider";
import { Textarea } from "../ui/textarea";
import { useSearchParams } from "next/navigation";
import { usePreviewUnit } from "@/app/api/projects/[projectId]/units/query";
import { Button } from "../ui/button";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { Loading } from "../ui/loader";
import { Label } from "@radix-ui/react-dropdown-menu";
import { DropdownMenu, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { parseAsInteger, useQueryState } from "next-usequerystate";
import { useCodebook } from "@/app/api/projects/[projectId]/codebooks/query";
import { parse } from "path";
import { SimpleDropdown } from "../ui/simpleDropdown";
import { useProject } from "@/app/api/projects/query";
import { CodebookPreview } from "@/app/projects/[projectId]/codebooks/design/page";

interface Props {
  projectId: number;
  codebookPreview?: CodebookPreview;
  jobId?: number;
  blockId?: number;
  setBlockId: (blockId: number) => void;
  setCodebookId: (codebookId: number) => void;
}

export function Preview({ projectId, codebookPreview, jobId, blockId, setBlockId, setCodebookId }: Props) {
  const { user } = useMiddlecat();
  const { data: job } = useJob(projectId, jobId);
  const { data: project } = useProject(projectId);
  const [jobServer, setJobServer] = useState<JobServerPreview | null>(null);
  const annotations = useRef<Record<string, Annotation[]>>({});
  const current = useRef<{ unit: number; variable?: string }>({ unit: 0 });
  const [size, setSize] = useLocalStorage("size", { width: 400, height: 500 });
  const [units, setUnits] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<{
    unitData: UnitData;
    unit: Unit;
  } | null>(null);

  const reset = useCallback(() => {
    annotations.current = {};
    current.current = { unit: 0 };
    setUnits((units) => [...units]);
  }, []);

  if (useWatchChange([project, user, codebookPreview, units, blockId])) {
    if (user && codebookPreview && project) {
      setJobServer(
        new JobServerPreview({
          user,
          project,
          codebookPreview,
          job,
          blockId,
          setBlockId,
          setCodebookId,
          annotations: annotations.current,
          current: current.current,
          setPreviewData,
        }),
      );
    }
  }

  if (!jobServer) return null;
  return (
    <div className="mx-auto mt-10 flex  flex-col items-center pb-4">
      <div className="grid w-full max-w-60 gap-6">
        <PreviewSize size={size} setSize={setSize} />
      </div>
      <PreviewWindow size={size} jobServer={jobServer} previewData={previewData} reset={reset} />
    </div>
  );
}

export function PreviewWindow({
  size,
  jobServer,
  previewData,
  reset,
}: {
  size: { height: number; width: number };
  jobServer: JobServerPreview;
  previewData: { unitData: UnitData; unit: Unit } | null;
  reset: () => void;
}) {
  const [focus, setFocus] = useState(false);

  if (!jobServer) return null;

  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <div
        tabIndex={0}
        className={`mt-6 max-w-full overflow-hidden rounded-lg   border border-foreground/50   ${focus ? " ring-4 ring-secondary ring-offset-2" : ""}`}
        style={{ minHeight: size.height + "px", height: size.height + "px", width: size.width + "px" }}
        onClick={(e) => {
          e.currentTarget.focus();
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      >
        <AnnotationInterface jobServer={jobServer} blockEvents={!focus} />
      </div>
      <div
        className=" flex max-w-full flex-col gap-3 pt-6"
        style={{ minHeight: size.height + "px", height: size.height + 24 + "px", width: size.width + "px" }}
      >
        <PreviewData previewData={previewData} />
        <Button className="h-12" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function PreviewData({ previewData }: { previewData: { unitData: UnitData; unit: Unit } | null }) {
  if (!previewData) return null;
  return (
    <div className="flex max-h-full flex-col gap-6 overflow-auto rounded border">
      <div>
        <div className="p-3">Unit columns</div>
        <pre className="pl-3 text-primary">{JSON.stringify(previewData.unitData?.data || "", undefined, 2)}</pre>
      </div>
      <div>
        <div className="p-3">Mapped content</div>
        <pre className=" pl-3 text-primary">{JSON.stringify(previewData.unit?.content || "", undefined, 2)}</pre>
      </div>
      <div>
        <div className="p-3">Annotations</div>
        <pre className="pl-3 text-primary">{JSON.stringify(previewData.unit?.annotations || "", undefined, 2)}</pre>
      </div>
    </div>
  );
}

function PreviewSize({
  size,
  setSize,
}: {
  size: { width: number; height: number };
  setSize: (size: { width: number; height: number }) => void;
}) {
  return (
    <div className="flex flex-auto gap-6">
      <div className="flex w-full flex-col gap-3">
        <div>Width</div>
        <Slider
          min={300}
          max={800}
          value={[size.width]}
          onValueChange={(width) => setSize({ ...size, width: width[0] })}
        />
      </div>
      {/* <div>{size.width} px</div> */}
      <div className="flex w-full flex-col gap-3">
        <div>Height</div>
        <Slider
          min={500}
          max={800}
          value={[size.height]}
          onValueChange={(height) => setSize({ ...size, height: height[0] })}
        />
        {/* <div>{size.height} px</div> */}
      </div>
    </div>
  );
}
