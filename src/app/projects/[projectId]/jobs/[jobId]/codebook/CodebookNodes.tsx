import { useCodebookNodes } from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { CodebookNode } from "@/app/types";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { Book, Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";
import { ZodError } from "zod";
import { CodebookPreview } from "./CodebookPreview";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodebookNodeForm } from "./CodebookNodeForm";
import { CodebookList } from "./CodebookList";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  projectId: number;
  jobId: number;
}

export interface CodebookNodeFormProps {
  position: CodebookNode["position"];
  parentId: CodebookNode["parentId"];
  type: CodebookNode["data"]["type"];
  currentId?: number;
}

export interface WindowProps {
  projectId: number;
  jobId: number;
  codebookNodeForm: CodebookNodeFormProps | null;
  setCodebookNodeForm: (props: CodebookNodeFormProps | null) => void;
  preview: CodebookNode | undefined | ZodError;
  setPreview?: (value: CodebookNode | undefined | ZodError) => void;
  showPreview: boolean;
  setShowPreview: (value: boolean) => void;
  changesPending: boolean;
  setChangesPending: (value: boolean) => void;
  codebookNodes: CodebookNode[] | undefined;
  isLoading: boolean;
  isPending: boolean;
}

export function CodebookNodes({ projectId, jobId }: Props) {
  const { data: codebookNodes, isLoading, isPending } = useCodebookNodes(projectId, jobId);
  const [CodebookNodeForm, setCodebookNodeForm] = useState<CodebookNodeFormProps | null>(null);
  const [preview, setPreview] = useState<CodebookNode | undefined | ZodError>(undefined);
  const [showJobPreview, setShowJobPreview] = useState(false);
  const [changesPending, setChangesPending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const windowProps: WindowProps = {
    projectId,
    jobId,
    codebookNodeForm: CodebookNodeForm,
    setCodebookNodeForm: setCodebookNodeForm,
    preview,
    setPreview,
    showPreview,
    setShowPreview,
    changesPending,
    setChangesPending,
    codebookNodes,
    isLoading,
    isPending,
  };

  const jobPreview = <ShowJobPreview {...windowProps} />;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-9 lg:grid-cols-[1fr,1fr]">
      <div className="flex flex-col gap-6 lg:hidden">
        <div className="flex w-full items-center gap-3">
          <Button
            className="flex flex-auto gap-3 text-foreground/60"
            variant="ghost"
            onClick={() => setShowJobPreview(!showJobPreview)}
          >
            preview {showJobPreview ? <EyeOff size={20} /> : <Eye size={20} />}
          </Button>
        </div>
        {showJobPreview ? jobPreview : <LeftWindow {...windowProps} />}
      </div>
      <div className="hidden lg:block">
        <LeftWindow {...windowProps} />
      </div>
      {showJobPreview}
      <div className="hidden lg:block">{jobPreview}</div>
    </div>
  );
}

function LeftWindow(props: WindowProps) {
  if (props.isLoading || props.isPending) return <Loading />;
  if (!props.codebookNodes) return <div>Codebook not found</div>;

  return (
    <div className={`relative flex w-full flex-col animate-in slide-in-from-top`}>
      <div className="max-w-2xl">
        <CodebookList {...props} />
      </div>
      <CodebookNodeFormDrawer {...props} />
    </div>
  );
}

function CodebookNodeFormDrawer(props: WindowProps) {
  const [confirm, setConfirm] = useState(false);

  function onConfirm() {
    props.setCodebookNodeForm(null);
    // props.setShowPreview(false);
  }

  function onOpenChange(open: boolean) {
    if (open) return;

    if (props.changesPending) {
      setConfirm(true);
    } else {
      onConfirm();
    }
  }

  function title() {
    if (!props.codebookNodeForm) return "";
    const what = props.codebookNodeForm.currentId ? "Edit" : "Create new";
    return `${what} ${props.codebookNodeForm.type.replaceAll("_", " ").toLowerCase()}`;
  }

  return (
    <>
      <Drawer direction="right" open={!!props.codebookNodeForm} onOpenChange={onOpenChange}>
        <DrawerContent
          className="right-0 top-0 max-w-[500px] p-0"
          overlayClassName="bg-black/60 h-[2000px] overflow-auto"
        >
          <DrawerHeader className="flex items-center justify-between p-3 pb-0">
            <Button
              className="flex items-center gap-3 pl-0 text-foreground/60"
              type="button"
              variant="ghost"
              onClick={() => props.setShowPreview(!props.showPreview)}
            >
              preview
              {props.showPreview ? <EyeOff size={20} /> : <Eye size={20} />}
            </Button>
            <DrawerTitle className="sr-only">Codebook item form</DrawerTitle>
            <DrawerDescription className="sr-only">Create and edit codebook items</DrawerDescription>
            <DrawerClose className="p-2">
              <X />
            </DrawerClose>
          </DrawerHeader>
          <div className="h-full max-h-screen overflow-y-auto p-3 pb-10 pt-6">
            <CodebookNodeForm {...props} />
          </div>
          <NodePreviewPopover {...props} />
        </DrawerContent>
      </Drawer>
      <ConfirmDialog
        title="Unsaved changes"
        message="Are you sure you want to discard your changes?"
        onAccept={onConfirm}
        open={confirm}
        setOpen={setConfirm}
      />
    </>
  );
}

function NodePreviewPopover(props: WindowProps) {
  return (
    <Dialog key="preview" modal={false} open={props.showPreview} onOpenChange={props.setShowPreview}>
      <DialogContent
        className="fixed left-0 top-0 max-h-screen translate-x-1 translate-y-12 gap-0 border-none bg-transparent p-0 pt-4 text-white shadow-none lg:translate-x-8 lg:translate-y-8"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="m-0 flex flex-row items-center justify-between px-3 pb-3">
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription className="sr-only">
            This dialog shows a preview of the current Codebook item
          </DialogDescription>
        </DialogHeader>
        <div
          className={`${props.codebookNodeForm ? "" : "hidden"} rounded-lg border-2 border-foreground/50 bg-foreground/50`}
        >
          <CodebookPreview projectId={props.projectId} jobId={props.jobId} preview={props.preview} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShowJobPreview({ projectId, jobId, codebookNodeForm, preview, changesPending }: WindowProps) {
  return (
    <div className="mx-auto w-full animate-slide-in-right lg:w-[450px]">
      <CodebookPreview projectId={projectId} jobId={jobId} preview={undefined} />
    </div>
  );
}
