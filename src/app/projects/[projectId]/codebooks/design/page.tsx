"use client";
import { useCodebook } from "@/app/api/projects/[projectId]/codebooks/query";
import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { JobBlockMeta } from "@/app/types";
import { useUnit } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { Preview } from "@/components/Common/Preview";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loader";
import { SimpleDropdown } from "@/components/ui/simpleDropdown";
import { Label } from "@radix-ui/react-dropdown-menu";
import { FileWarning, Save, TriangleAlert, X } from "lucide-react";
import { parseAsInteger, useQueryState } from "next-usequerystate";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { toast } from "sonner";
import { set, z } from "zod";

type Codebook = z.infer<typeof CodebookSchema>;
export type CodebookPreview = { id: number; codebook: Codebook };

interface SaveOnChange {
  dirty: boolean;
  save?: () => Promise<void>;
}

export default function CodebookDesign(props: { params: Promise<{ projectId: number; codebookId: number }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [preview, setPreview] = useState<CodebookPreview | undefined>();
  const saveOnChange = useRef<SaveOnChange>({ dirty: false });

  const [codebookId, setCodebookId] = useQueryState<number>("codebookId", parseAsInteger);
  const [safeCodebookId, setSafeCodebookId] = useState<number | null>(null);
  const [jobId, setJobId] = useQueryState<number>("jobId", parseAsInteger);
  const [blockId, setBlockId] = useQueryState<number>("blockId", parseAsInteger);

  const { data: codebook, isLoading: codebookLoading } = useCodebook(params.projectId, codebookId ?? undefined);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated codebook");
  }, []);

  if (!codebookId && !jobId) router.push(`/projects/${params.projectId}/codebooks`);
  // if (codebookId && codebookLoading) return <Loading />;

  const nJobs = codebook?.nJobs || 0;

  return (
    <div className="mx-auto  grid  grid-cols-1 gap-3 xl:grid-cols-[auto,1fr]">
      <SaveOnChangeDialog
        safeCodebookId={safeCodebookId}
        codebookId={codebookId}
        setCodebookId={setCodebookId}
        saveOnChange={saveOnChange.current}
      />
      <div className="mx-auto w-[600px] max-w-[95vw] overflow-auto py-6 xl:max-h-[calc(100vh-var(--header-height))]">
        {jobId ? (
          <PreviewJob
            projectId={params.projectId}
            jobId={jobId}
            blockId={blockId}
            setBlockId={setBlockId}
            setCodebookId={setSafeCodebookId}
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
            saveOnChange={saveOnChange}
          />
        ) : null}
      </div>
      <div className="relative flex justify-center overflow-auto xl:h-[calc(100vh-var(--header-height))] ">
        <Preview
          projectId={params.projectId}
          codebookPreview={preview}
          jobId={jobId || undefined}
          blockId={blockId || undefined}
          setBlockId={setBlockId}
          setCodebookId={setSafeCodebookId}
        />
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

  const current = job?.blocks.find((block) => block.id === blockId);

  if (jobId === null) return null;
  if (jobLoading) return <Loading />;
  if (!job) return <div>Could not load Job</div>;

  return (
    <div className="mx-8 flex flex-col justify-center gap-2  rounded bg-primary p-3 text-primary-foreground">
      <h3 className="prose-h3  pl-3">Job: {job.name}</h3>
      <div className="flex flex-col">
        {job?.blocks.map((block, i) => {
          return (
            <div key={block.id}>
              <Button
                key={block.id}
                onClick={() => {
                  setBlockId(block.id);
                  setCodebookId(block.codebookId);
                }}
                className={`flex h-8  gap-3 py-0 ${block.id === blockId ? "" : "text-foreground/60"}`}
                variant="default"
              >
                <div className="flex h-6 w-5 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  {i + 1}
                </div>
                {block.name ? <div className="rounded-md font-bold ">{block.name}</div> : null}
                <div className="italic">{`${block.nVariables} ${block.type} variable${block.nVariables === 1 ? "" : "s"}`}</div>
              </Button>
            </div>
          );
        })}
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

interface SaveOnChangeDialogProps {
  safeCodebookId: number | null;
  codebookId: number | null;
  setCodebookId: (id: number) => void;
  saveOnChange: SaveOnChange;
}

function SaveOnChangeDialog({ safeCodebookId, codebookId, setCodebookId, saveOnChange }: SaveOnChangeDialogProps) {
  useEffect(() => {
    const saveable = saveOnChange.dirty && saveOnChange.save;
    if (safeCodebookId === null) return;
    if (codebookId !== safeCodebookId && !saveable) setCodebookId(safeCodebookId);
  }, [safeCodebookId, codebookId, saveOnChange.dirty, saveOnChange.save, setCodebookId]);

  if (codebookId === null) return null;
  if (safeCodebookId === null) return null;
  if (codebookId === safeCodebookId) return null;
  const saveable = saveOnChange.dirty && saveOnChange.save;
  if (!saveable) return null;

  return (
    <Dialog open={true}>
      <DialogContent className="prose dark:prose-invert [&>button]:hidden">
        <DialogHeader>
          <h3 className="mt-0">Unsaved changes</h3>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            You navigated to a different codebook, but there are unsaved changes. Do you want to save these changes?
          </div>
          <div className="mt-3 flex justify-between gap-3">
            <Button
              className="flex w-min items-center gap-2"
              variant="destructive"
              onClick={() => {
                setCodebookId(safeCodebookId);
              }}
            >
              <X className=" h-5 w-5" />
              Discard changes
            </Button>
            <Button
              className="flex w-min items-center gap-2"
              variant="default"
              onClick={() => {
                if (saveOnChange.save) saveOnChange.save().then(() => setCodebookId(safeCodebookId));
              }}
            >
              <Save className=" h-5 w-5" />
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
