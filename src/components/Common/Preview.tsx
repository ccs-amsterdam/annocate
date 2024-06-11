import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { UnitLayoutSchema } from "@/app/api/projects/[projectId]/units/layouts/schemas";
import { UnitDataResponseSchema } from "@/app/api/projects/[projectId]/units/schemas";
import { Annotation, Unitset, Codebook, Layout } from "@/app/types";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useMiddlecat } from "middlecat-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AnnotationInterface } from "../AnnotationInterface/AnnotationInterface";
import { useUnit } from "../AnnotatorProvider/AnnotatorProvider";
import JobServerPreview from "../JobServers/JobServerPreview";
import { Slider } from "../ui/slider";
import useWatchChange from "@/hooks/useWatchChange";
import { useCodebook } from "@/app/api/projects/[projectId]/codebooks/query";
import { useUnitLayout } from "@/app/api/projects/[projectId]/units/layouts/query";

interface Props {
  projectId: number;
  layout?: Layout;
  codebook?: Codebook;
  unitset?: Unitset;
}

export function Preview({ projectId, layout, codebook, unitset }: Props) {
  const { user } = useMiddlecat();
  const [jobServer, setJobServer] = useState<JobServerPreview | null>(null);
  const annotations = useRef<Record<string, Annotation[]>>({});
  const [size, setSize] = useLocalStorage("size", { width: 400, height: 500 });

  // either do this here, or outside of preview and make layout and codebook mandatory
  // const [selectedCodebookId, setSelectedCodebookId] = useState<number | undefined>();
  // const [selectedLayoutId, setSelectedLayoutId] = useState<number | undefined>();
  // const [selectedUnitSetId, setSelectedUnitSetId] = useState<number | undefined>();

  // const { data: selectedCodebook } = useCodebook(projectId, selectedCodebookId);
  // const { data: selectedLayout } = useUnitLayout(projectId, selectedLayoutId);

  if (useWatchChange([projectId, user, codebook, layout, unitset])) {
    if (user) setJobServer(new JobServerPreview(projectId, user, codebook, layout, unitset, annotations.current));
  }

  if (!jobServer) return null;
  return (
    <div className="mt-10 flex w-full flex-col items-center">
      <PreviewSize size={size} setSize={setSize} />
      <PreviewWindow size={size} jobServer={jobServer} />
    </div>
  );
}

export function PreviewWindow({
  size,
  jobServer,
}: {
  size: { height: number; width: number };
  jobServer: JobServerPreview;
}) {
  const [focus, setFocus] = useState(false);
  if (!jobServer) return null;

  return (
    <div
      tabIndex={0}
      className={`mt-10 max-w-full overflow-hidden rounded-lg   border border-foreground/50   ${focus ? " ring-4 ring-secondary ring-offset-2" : ""}`}
      style={{ height: size.height + "px", width: size.width + "px" }}
      onClick={(e) => {
        e.currentTarget.focus();
      }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <AnnotationInterface jobServer={jobServer} blockEvents={!focus} />
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
    <div className="grid w-full max-w-[300px] grid-cols-[4rem,1fr]  gap-2 px-4">
      <div>Width</div>
      <Slider
        min={300}
        max={800}
        value={[size.width]}
        onValueChange={(width) => setSize({ ...size, width: width[0] })}
      />
      {/* <div>{size.width} px</div> */}
      <div>Height</div>
      <Slider
        min={500}
        max={800}
        value={[size.height]}
        onValueChange={(height) => setSize({ ...size, height: height[0] })}
      />
      {/* <div>{size.height} px</div> */}
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
