import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { UnitLayoutSchema } from "@/app/api/projects/[projectId]/units/layouts/schemas";
import { UnitDataResponseSchema, UnitDataRowSchema } from "@/app/api/projects/[projectId]/units/schemas";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import JobServerPreview from "../JobServers/JobServerPreview";
import UnitProvider, { useUnit } from "../UnitProvider/UnitProvider";
import QuestionTask from "../AnnotationInterface/QuestionTask";
import { Slider } from "../ui/slider";
import { Annotation } from "@/app/types";

type Unit = z.infer<typeof UnitDataResponseSchema>;
type Codebook = z.infer<typeof CodebookSchema>;
type Layout = z.infer<typeof UnitLayoutSchema>;

// export function Preview({ layout, codebook }: { unit: Unit; layout: Layout; codebook: Codebook }) {
//   const [jobServer, setJobServer] = useState<JobServerPreview | null>(null);
//   const annotations = useRef<Record<string, Annotation[]>>({});

//   useEffect(() => {
//     if (!layout || !codebook) return;
//     const unit = { ...unit, unit: { ...unit.unit, codebook: codebook } };
//     setJobServer(new JobServerPreview(layout, [unit]));
//   }, [layout, codebook, annotations.current]);

//   if (!jobServer) return null;
//   return <PreviewWindow jobServer={jobServer} />;
// }

export function PreviewWindow({ jobServer }: { jobServer: JobServerPreview }) {
  const [focus, setFocus] = useState(false);
  const [size, setSize] = useLocalStorage("size", { width: 400, height: 500 });

  //   const jobServer = useMemo(() => {
  //     if (!preview) return null;
  //     const unit = { ...rawPreviewUnit, unit: { ...rawPreviewUnit.unit, codebook: preview } };
  //     return new JobServerPreview(preview, [unit]);
  //   }, [preview]);

  if (!jobServer) return null;

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mt-10 grid w-96 grid-cols-[4rem,1fr,4rem] gap-2">
        <div>Width</div>
        <Slider min={300} max={800} value={[size.width]} onValueChange={(width) => setSize({ ...size, width })} />
        <div>{size.width} px</div>
        <div>Height</div>
        <Slider min={500} max={800} value={[size.height]} onValueChange={(height) => setSize({ ...size, height })} />
        <div>{size.height} px</div>
      </div>
      <div
        tabIndex={0}
        className={`border-1 mt-10 rounded-lg  border-foreground/50 bg-foreground/50 p-1  ${focus ? " ring-4 ring-secondary ring-offset-2" : ""}`}
        style={{ height: size.height + "px", width: size.width + "px" }}
        onClick={(e) => {
          e.currentTarget.focus();
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      >
        <UnitProvider jobServer={jobServer}>
          <QuestionTask blockEvents={!focus} />
          <PreviewAnnotations />
        </UnitProvider>
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
