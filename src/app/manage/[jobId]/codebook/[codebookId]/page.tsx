"use client";
import { useJob } from "@/app/api/jobs/query";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { useCodebook, useCodebooks } from "@/app/api/jobs/[jobId]/codebook/query";
import { Loading } from "@/components/ui/loader";
import { useState } from "react";
import { CodebookSchema, CodebooksCreateOrUpdateSchema } from "@/app/api/jobs/[jobId]/codebook/schemas";
import { z } from "zod";

type Codebook = z.infer<typeof CodebookSchema>;

export default function Job({ params }: { params: { jobId: number; codebookId: number } }) {
  const [preview, setPreview] = useState<Codebook | undefined>();
  const { data: codebook, isLoading } = useCodebook(params.jobId, params.codebookId);

  if (isLoading) return <Loading />;
  if (!codebook) return <div>Codebook not found</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      <div className="p-3">
        <UpdateCodebook jobId={params.jobId} current={codebook} setPreview={setPreview} />
      </div>
    </div>
  );
}
