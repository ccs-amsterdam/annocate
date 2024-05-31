"use client";
import { useCodebook } from "@/app/api/jobs/[jobId]/codebook/query";
import { CodebookSchema } from "@/app/api/jobs/[jobId]/codebook/schemas";
import { RawUnit } from "@/app/types";
import QuestionTask from "@/components/AnnotationInterface/QuestionTask";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import JobServerPreview from "@/components/JobServers/JobServerPreview";
import UnitProvider, { useUnit } from "@/components/UnitProvider/UnitProvider";
import { Loading } from "@/components/ui/loader";
import { Slider } from "@/components/ui/slider";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { LoremIpsum } from "./lorem";

type Codebook = z.infer<typeof CodebookSchema>;

export default function Job({ params }: { params: { jobId: number; codebookId: number } }) {
  const [preview, setPreview] = useState<Codebook | undefined>();
  const { data: codebook, isLoading } = useCodebook(params.jobId, params.codebookId);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated codebook");
  }, []);

  if (isLoading) return <Loading />;
  if (!codebook) return <div>Codebook not found</div>;

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="relative flex justify-center">
        <PreviewCodebook preview={preview} />
      </div>
      <div className="max-h-[calc(100vh-var(--header-height))] max-w-[600px] overflow-auto py-6">
        <UpdateCodebook jobId={params.jobId} current={codebook} setPreview={setPreview} afterSubmit={confirmUpdate} />
      </div>
    </div>
  );
}

function PreviewCodebook({ preview }: { preview?: Codebook }) {
  const [focus, setFocus] = useState(false);
  const [size, setSize] = useLocalStorage("size", { width: 400, height: 500 });

  const jobServer = useMemo(() => {
    if (!preview) return null;
    const unit = { ...rawPreviewUnit, unit: { ...rawPreviewUnit.unit, codebook: preview } };
    return new JobServerPreview(preview, [unit]);
  }, [preview]);

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

  // return (
  //   <div>
  //     {annotationLib.map((annotation) => (
  //       <div key={annotation.id}>
  //         {annotation.type} - {annotation.value}
  //       </div>
  //     ))}
  //   </div>
  // );
}

const rawPreviewUnit: RawUnit = {
  index: 0,
  status: "IN_PROGRESS",
  id: "id",
  type: "code",
  unit: {
    codebookId: "demo_codebook",
    annotations: [],
    text_fields: [
      { name: "title", value: LoremIpsum.split("\n\n")[0], style: { fontSize: "1.2rem", fontWeight: "bold" } },
      {
        name: "lorem",
        value: LoremIpsum.split("\n\n").slice(1).join("\n\n"),
      },
    ],
  },
};
