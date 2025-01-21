"use client";
import { useCodebook } from "@/app/api/projects/[projectId]/codebooks/query";
import { CodebookSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { SetState } from "@/app/types";
import { useUnit } from "@/components/AnnotatorProvider/AnnotatorProvider";
import { Preview } from "@/components/Common/Preview";
import { UpdateCodebook } from "@/components/Forms/codebookForms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loader";
import { SimpleDropdown } from "@/components/ui/simpleDropdown";
import { Label } from "@radix-ui/react-dropdown-menu";
import { FileWarning, Save, TriangleAlert, X } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, use, SetStateAction } from "react";
import { toast } from "sonner";
import { set, z } from "zod";

type Codebook = z.infer<typeof CodebookSchema>;
export type CodebookPreview = { id: number; codebook: Codebook };

interface SaveOnChange {
  dirty: boolean;
  error: boolean;
  save?: () => Promise<void>;
}

export default function JobDesign(props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [preview, setPreview] = useState<CodebookPreview | undefined>();

  const [switchBlock, setSwitchBlock] = useState<number | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [blockId, setBlockId] = useQueryState<number>("blockId", parseAsInteger);

  const saveOnChange = useRef<SaveOnChange>({ dirty: false, error: false });

  const { data: job } = useJob(params.projectId, params.jobId ?? undefined);
  const codebookId = job?.blocks.find((block) => block.id === blockId)?.codebookId;
  const { data: codebook, isLoading: codebookLoading } = useCodebook(params.projectId, codebookId ?? undefined);

  const confirmUpdate = useCallback(() => {
    toast.success("Updated codebook");
  }, []);

  const nJobs = codebook?.nJobs || 0;

  return (
    <div className="mx-auto grid grid-cols-1 gap-3 xl:grid-cols-[auto,1fr]">
      <SaveOnChangeDialog
        switchBlock={switchBlock}
        setSwitchBlock={setSwitchBlock}
        blockId={blockId}
        setBlockId={setBlockId}
        saveOnChange={saveOnChange.current}
        setResetTrigger={setResetTrigger}
      />
      <div className="mx-auto w-[600px] max-w-[95vw] overflow-auto py-6 xl:max-h-[calc(100vh-var(--header-height))]">
        <PreviewJob
          projectId={params.projectId}
          jobId={params.jobId}
          blockId={blockId}
          setSwitchBlock={setSwitchBlock}
        />
        <h2 className="mb-3 mt-9 px-8">
          {codebook?.codebook.type === "annotation" ? "Annotation Codebook" : "Survey Codebook"}
        </h2>
        {nJobs > 1 ? (
          <div className="flex justify-between gap-3 px-6">
            <div className="ml-auto flex items-center gap-3 rounded border-primary px-3 py-2 text-primary">
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
      <div className="relative flex justify-center overflow-auto xl:h-[calc(100vh-var(--header-height))]">
        <Preview
          projectId={params.projectId}
          codebookPreview={preview}
          jobId={params.jobId}
          blockId={blockId || undefined}
          setBlockId={setSwitchBlock}
          resetTrigger={resetTrigger}
        />
      </div>
    </div>
  );
}

function PreviewJob({
  projectId,
  jobId,
  blockId,
  setSwitchBlock,
}: {
  projectId: number;
  jobId: number;
  blockId: number | null;
  setSwitchBlock: (id: number) => void;
}) {
  const { data: job, isLoading: jobLoading } = useJob(projectId, jobId ?? undefined);

  const current = job?.blocks.find((block) => block.id === blockId);

  if (jobId === null) return null;
  if (jobLoading) return <Loading />;
  if (!job) return <div>Could not load Job</div>;

  return (
    <div className="mx-8 flex flex-col justify-center gap-2 rounded bg-primary p-3 text-primary-foreground">
      <h3 className="prose-h3 pl-3">Job: {job.name}</h3>
      <div className="flex flex-col">
        {job?.blocks.map((block, i) => {
          return (
            <div key={block.id}>
              <Button
                key={block.id}
                onClick={() => {
                  setSwitchBlock(block.id);
                }}
                className={`flex h-8 gap-3 py-0 ${block.id === blockId ? "" : "text-foreground/60"}`}
                variant="default"
              >
                <div className="flex h-6 w-5 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  {i + 1}
                </div>
                {block.name ? <div className="rounded-md font-bold">{block.name}</div> : null}
                <div className="italic">{`${block.nVariables} ${block.type} variable${block.nVariables === 1 ? "" : "s"}`}</div>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SaveOnChangeDialogProps {
  switchBlock: number | null;
  setSwitchBlock: (id: number | null) => void;
  blockId: number | null;
  setBlockId: (id: number) => void;
  saveOnChange: SaveOnChange;
  setResetTrigger: SetState<number>;
}

function SaveOnChangeDialog({
  switchBlock,
  setSwitchBlock,
  blockId,
  setBlockId,
  saveOnChange,
  setResetTrigger,
}: SaveOnChangeDialogProps) {
  useEffect(() => {
    const saveable = saveOnChange.dirty && saveOnChange.save;
    if (switchBlock === null) return;
    if (blockId !== switchBlock && !saveable) setBlockId(switchBlock);
  }, [switchBlock, blockId, saveOnChange.dirty, saveOnChange.save, setBlockId]);

  if (blockId === null) return null;
  if (switchBlock === null) return null;
  if (blockId === switchBlock) return null;
  const saveable = saveOnChange.dirty && saveOnChange.save;
  if (!saveable) return null;

  return (
    <Dialog open={true}>
      <DialogContent className="prose dark:prose-invert [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="mt-0">Unsaved changes</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            You are navigating to a different codebook, but there are unsaved changes. Do you want to save these
            changes?
          </div>
          <div className="mt-3 flex justify-between gap-3">
            <Button
              className="flex w-min items-center gap-2"
              variant="outline"
              onClick={() => {
                setSwitchBlock(blockId);
                setResetTrigger((prev) => prev + 1);
              }}
            >
              Go back
            </Button>
            <Button
              className="flex w-min items-center gap-2"
              variant="destructive"
              onClick={() => {
                setBlockId(switchBlock);
              }}
            >
              <X className="h-5 w-5" />
              Discard changes
            </Button>
            <Button
              disabled={saveOnChange.error}
              className="flex w-min items-center gap-2"
              variant="default"
              onClick={() => {
                if (saveOnChange.save) saveOnChange.save().then(() => setBlockId(switchBlock));
              }}
            >
              <Save className="h-5 w-5" />
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
