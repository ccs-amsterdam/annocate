"use client";
import { useCodebook } from "@/app/api/projects/[projectId]/codebooks/query";
import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { JobBlockMeta } from "@/app/types";
import { useUnit } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { Preview } from "@/components/Common/Preview";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimpleDropdown } from "@/components/ui/simpleDropdown";
import { Label } from "@radix-ui/react-dropdown-menu";
import { FileWarning, TriangleAlert } from "lucide-react";
import { parseAsInteger, useQueryState } from "next-usequerystate";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { set, z } from "zod";

type Codebook = z.infer<typeof CodebookSchema>;

export default function CodebookDesign({ params }: { params: { projectId: number; codebookId: number } }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Codebook | undefined>();

  const [codebookId, setCodebookId] = useQueryState<number>("codebookId", parseAsInteger);
  const [jobId, setJobId] = useQueryState<number>("jobId", parseAsInteger);
  const [blockId, setBlockId] = useQueryState<number>("blockId", parseAsInteger);

  const { data: codebook, isLoading: codebookLoading } = useCodebook(params.projectId, codebookId ?? undefined);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated codebook");
  }, []);

  if (!codebookId && !jobId) router.push(`/projects/${params.projectId}/codebooks`);
  if (codebookId && codebookLoading) return <Loading />;

  const nJobs = codebook?.nJobs || 0;

  return (
    <div className="mx-auto  grid  grid-cols-1 gap-3 xl:grid-cols-[auto,1fr]">
      <div className="mx-auto w-[600px] max-w-[95vw] overflow-auto py-6 xl:max-h-[calc(100vh-var(--header-height))]">
        {jobId ? (
          <PreviewJob
            projectId={params.projectId}
            jobId={jobId}
            blockId={blockId}
            setBlockId={setBlockId}
            setCodebookId={setCodebookId}
          />
        ) : (
          <div className="h-20"></div>
        )}
        <h2 className="mb-3 mt-9 px-8">
          {codebook?.codebook.type === "annotation" ? "Annotation Codebook" : "Survey Codebook"}
        </h2>
        {nJobs > 1 ? (
          <div className="flex justify-between gap-3 px-6">
            <div className="ml-auto flex items-center gap-3 rounded  border-primary px-3 py-2 text-primary">
              This codebook is used in {nJobs} jobs
              <TriangleAlert />
            </div>
            {/* <Button>Make copy</Button> */}
          </div>
        ) : null}

        {codebook ? (
          <UpdateCodebook
            projectId={params.projectId}
            current={codebook}
            setPreview={setPreview}
            afterSubmit={confirmUpdate}
          />
        ) : null}
      </div>
      <div className="relative flex justify-center overflow-auto xl:h-[calc(100vh-var(--header-height))] ">
        {preview ? (
          <Preview
            projectId={params.projectId}
            codebook={preview}
            jobId={jobId || undefined}
            blockId={blockId || undefined}
            setBlockId={setBlockId}
            setCodebookId={setCodebookId}
          />
        ) : (
          <Loading />
        )}
      </div>
    </div>
  );
}

function PreviewJob({
  projectId,
  jobId,
  blockId,
  setBlockId,
  setCodebookId,
}: {
  projectId: number;
  jobId: number;
  blockId: number | null;
  setBlockId: (id: number) => void;
  setCodebookId: (id: number) => void;
}) {
  const { data: job, isLoading: jobLoading } = useJob(projectId, jobId ?? undefined);

  const blockOptions = useMemo(() => {
    if (!job) return [];
    return job.blocks
      .sort((a, b) => a.position - b.position)
      .map((block) => ({ id: block.id, codebookId: block.codebookId, label: blockLabel(block) }));
  }, [job]);
  const block = job?.blocks.find((block) => block.id === blockId);

  if (jobId === null) return null;
  if (jobLoading) return <Loading />;
  if (!job) return <div>Could not load Job</div>;

  return (
    <div className="mx-8 flex flex-col justify-center gap-1  rounded bg-primary p-3 text-primary-foreground">
      <h3 className="prose-h3 pl-3">{job.name}</h3>
      <div className="flex items-center gap-3">
        <SimpleDropdown
          options={blockOptions}
          optionKey={"label"}
          placeholder="select block"
          value={block ? blockLabel(block) : undefined}
          onSelect={(block) => {
            setBlockId(block.id);
            setCodebookId(block.codebookId);
          }}
        />
      </div>
    </div>
  );
}

function blockLabel(block: JobBlockMeta) {
  if (block.name)
    return `
    ${block.name}
  `;
  return `block ${block.position + 1}`;
}
