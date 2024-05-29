"use client";
import { useCodebook } from "@/app/api/jobs/[jobId]/codebook/query";
import { CodebookSchema } from "@/app/api/jobs/[jobId]/codebook/schemas";
import { RawUnit, Unit } from "@/app/types";
import QuestionTask from "@/components/AnnotationInterface/QuestionTask";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { Loading } from "@/components/ui/loader";
import { importCodebook } from "@/functions/codebook";
import { prepareUnit } from "@/functions/processUnitContent";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { LoremIpsum } from "./lorem";
import JobServerDemo from "@/components/Demo/JobServerDemo";
import UnitProvider from "@/components/UnitProvider/UnitProvider";

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
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="relative flex justify-center">
        <PreviewCodebook preview={preview} />
      </div>
      <div className="max-h-[calc(100vh-var(--header-height))] overflow-auto py-6">
        <UpdateCodebook jobId={params.jobId} current={codebook} setPreview={setPreview} afterSubmit={confirmUpdate} />
      </div>
    </div>
  );
}

function PreviewCodebook({ preview }: { preview?: Codebook }) {
  const [size, setSize] = useState({ width: 500, height: 800 });
  const [focus, setFocus] = useState(false);

  const jobServer = useMemo(() => {
    if (!preview) return null;
    return new JobServerDemo(preview, [rawPreviewUnit]);
  }, [preview]);

  if (!jobServer) return null;

  return (
    <div className="">
      <div
        tabIndex={0}
        className={`border-1 mt-10 rounded-lg  border-foreground/50 bg-foreground/50 p-1  ${focus ? " ring-4 ring-secondary ring-offset-2" : ""}`}
        style={size}
        onClick={(e) => {
          e.currentTarget.focus();
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      >
        <UnitProvider jobServer={jobServer}>
          <QuestionTask blockEvents={!focus} />;
        </UnitProvider>
      </div>
    </div>
  );
}

const rawPreviewUnit: RawUnit = {
  index: 0,
  status: "IN_PROGRESS",
  id: "id",
  type: "code",
  unit: {
    codebookId: "demo_codebook",
    text_fields: [
      { name: "title", value: LoremIpsum.split("\n\n")[0], style: { fontSize: "1.2rem", fontWeight: "bold" } },
      {
        name: "lorem",
        value: LoremIpsum.split("\n\n").slice(1).join("\n\n"),
      },
    ],
  },
};
