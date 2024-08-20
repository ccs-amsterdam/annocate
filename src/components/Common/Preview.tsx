import { Annotation, Codebook, Layout, Unit, UnitData } from "@/app/types";
import useLocalStorage from "@/hooks/useLocalStorage";
import useWatchChange from "@/hooks/useWatchChange";
import { useMiddlecat } from "middlecat-react";
import { use, useEffect, useRef, useState } from "react";
import { AnnotationInterface } from "../AnnotationInterface/AnnotationInterface";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import JobServerPreview from "../JobServers/JobServerPreview";
import { Slider } from "../ui/slider";
import { Textarea } from "../ui/textarea";
import { useSearchParams } from "next/navigation";
import { useJob, useJobBlockUnits } from "@/app/api/projects/[projectId]/jobs/query";
import { usePreviewUnits } from "@/app/api/projects/[projectId]/units/query";
import { Button } from "../ui/button";

interface Props {
  projectId: number;
  codebook: Codebook;
}

export function Preview({ projectId, codebook }: Props) {
  const { user } = useMiddlecat();
  const [jobServer, setJobServer] = useState<JobServerPreview | null>(null);
  const annotations = useRef<Record<string, Annotation[]>>({});
  const [size, setSize] = useLocalStorage("size", { width: 400, height: 500 });
  const [units, setUnits] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ unit: number; variable: number }>({ unit: 0, variable: 0 });
  const [previewData, setPreviewData] = useState<{
    unitData: UnitData;
    unit: Unit;
  } | null>(null);

  const searchparams = useSearchParams();
  const blockId = searchparams?.get("blockId") ? parseInt(searchparams.get("blockId") as string) : undefined;

  // either do this here, or outside of preview and make layout and codebook mandatory
  // const [selectedCodebookId, setSelectedCodebookId] = useState<number | undefined>();
  // const [selectedLayoutId, setSelectedLayoutId] = useState<number | undefined>();
  // const [selectedUnitSetId, setSelectedUnitSetId] = useState<number | undefined>();

  // const { data: selectedCodebook } = useCodebook(projectId, selectedCodebookId);
  // const { data: selectedLayout } = useUnitLayout(projectId, selectedLayoutId);

  if (useWatchChange([projectId, user, codebook, units])) {
    if (user)
      setJobServer(
        new JobServerPreview(
          projectId,
          user,
          codebook,
          units,
          annotations.current,
          current,
          setCurrent,
          setPreviewData,
        ),
      );
  }

  if (!jobServer) return null;
  return (
    <div className="mx-auto mt-10 flex  flex-col items-center pb-4">
      <div className="mx-auto grid  grid-cols-[100px,1fr] gap-6">
        <PreviewSize size={size} setSize={setSize} />
        <PreviewUnits units={units} setUnits={setUnits} projectId={projectId} blockId={blockId} />
      </div>
      <PreviewWindow size={size} jobServer={jobServer} previewData={previewData} />
    </div>
  );
}

export function PreviewWindow({
  size,
  jobServer,
  previewData,
}: {
  size: { height: number; width: number };
  jobServer: JobServerPreview;
  previewData: { unitData: UnitData; unit: Unit } | null;
}) {
  const [focus, setFocus] = useState(false);
  if (!jobServer) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div
        tabIndex={0}
        className={`mt-10 max-w-full overflow-hidden rounded-lg   border border-foreground/50   ${focus ? " ring-4 ring-secondary ring-offset-2" : ""}`}
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
        className=" w-[400px] max-w-full pt-10"
        style={{ minHeight: size.height + "px", height: size.height + "px" }}
      >
        <PreviewData previewData={previewData} />
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
    <div className="flex  flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>Width</div>
        <Slider
          min={300}
          max={800}
          value={[size.width]}
          onValueChange={(width) => setSize({ ...size, width: width[0] })}
        />
      </div>
      {/* <div>{size.width} px</div> */}
      <div className="flex flex-col gap-3">
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

function PreviewUnits({
  units,
  setUnits,
  projectId,
  blockId,
}: {
  units: string[];
  setUnits: (units: string[]) => void;
  projectId: number;
  blockId?: number;
}) {
  const { data: previewUnits } = usePreviewUnits(projectId, blockId);
  const [changed, setChanged] = useState<boolean | null>(null);

  useEffect(() => {
    if (previewUnits) {
      setChanged(false);
      setUnits(previewUnits);
    }
  }, [previewUnits, setUnits, setChanged]);

  return (
    <div className="flex flex-col gap-3">
      <div>Preview units</div>
      <div className="relative">
        <Textarea
          wrap="off"
          value={units.join("\n")}
          onChange={(e) => {
            if (changed === false) setChanged(true);
            setUnits(e.target.value.split("\n"));
          }}
          className="w-72"
          placeholder="Enter unit ids. if empty, use all units"
        />
        <div
          className={`absolute bottom-[5px] right-1 select-none bg-background/70 pl-1  pr-1 text-sm italic text-secondary`}
        >
          {changed ? (
            <Button
              variant="link"
              className="h-5"
              onClick={() => {
                setChanged(false);
                setUnits(previewUnits || []);
              }}
            >
              reset sample
            </Button>
          ) : blockId ? (
            "Sampled from selected job block"
          ) : (
            "Sampled from all units"
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewAnnotations() {
  const { annotationLib } = useUnit();

  return (
    <div className="mt-6">
      {Object.values(annotationLib.annotations).map((a) => {
        return (
          <div key={a.id} className="text-sm">
            {a.variable} - {a.code}
          </div>
        );
      })}
    </div>
  );
}
