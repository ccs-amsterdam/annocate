"use client";
import { useCodebook } from "@/app/api/jobs/[jobId]/codebook/query";
import { CodebookSchema } from "@/app/api/jobs/[jobId]/codebook/schemas";
import { Unit } from "@/app/types";
import QuestionTask from "@/components/AnnotationInterface/QuestionTask";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { Loading } from "@/components/ui/loader";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

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
      <div className="max-h-[calc(100vh-var(--header-height))] ">
        <UpdateCodebook jobId={params.jobId} current={codebook} setPreview={setPreview} afterSubmit={confirmUpdate} />
      </div>
      <PreviewCodebook preview={preview} />
    </div>
  );
}

function PreviewCodebook({ preview }: { preview?: Codebook }) {
  if (!preview) return null;
  return (
    <div>
      <QuestionTask unit={previewUnit} codebook={preview} nextUnit={() => null} blockEvents={true} />;
    </div>
  );
}

const previewUnit: Unit = {
  unitId: "id",
  unitType: "code",
  unit: {
    textFields: [],
  },
  status: "IN_PROGRESS",
};
