import {
  useDeleteJobBlock,
  useJobBlock,
  useJobBlocksTree,
  useUpdateJobBlockTree,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { JobBlockTreeUpdateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { JobBlockResponse, JobBlockTreeResponse } from "@/app/types";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Edit, PlusIcon, Trash, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { getValidChildren } from "@/functions/treeFunctions";

interface Props {
  projectId: number;
  jobId: number;
}

interface BlockFormProps {
  projectId: number;
  jobId: number;
  position: JobBlockResponse["position"];
  parentId: JobBlockResponse["parentId"];
  type: JobBlockResponse["type"];
  currentId?: number;
}

export function JobBlocks({ projectId, jobId }: Props) {
  const { data: blocks, isLoading } = useJobBlocksTree(projectId, jobId);
  const [blockForm, setBlockForm] = useState<BlockFormProps | null>(null);
  const [preview, setPreview] = useState<z.infer<typeof JobBlockTreeUpdateSchema> | null>(null);

  function header() {
    if (!blockForm) return "...";
    if (blockForm.type === "surveyPhase") return "Survey phase";
    if (blockForm.type === "annotationPhase") return "Annotation phase";
    if (blockForm.type === "surveyQuestion") return "Survey question";
    if (blockForm.type === "annotationQuestion") return "Annotation question";
    let type = "Annotation question";
    return `${type}`;
  }

  function conditionalRenderLeft() {
    if (isLoading) return <Loading />;
    if (!blocks) return <div>Job blocks not found</div>;

    if (!!blockForm)
      return (
        <div className="flex h-full w-full animate-slide-in-right flex-col gap-6 p-3">
          <CreateOrUpdateJobBlock
            {...blockForm}
            header={header()}
            currentId={blockForm.currentId}
            afterSubmit={() => setBlockForm(null)}
            setPreview={setPreview}
            onCancel={() => setBlockForm(null)}
          />
        </div>
      );

    return (
      <div className="flex animate-slide-in-left flex-col">
        {(blocks || []).map((block) => {
          return (
            <JobBlockItem
              key={block.id}
              block={block}
              projectId={projectId}
              jobId={jobId}
              setBlockForm={setBlockForm}
            />
          );
        })}
        <div className="mt-12">
          <CreateBlock
            newBlock
            projectId={projectId}
            jobId={jobId}
            parentId={null}
            position={99999}
            setBlockForm={setBlockForm}
          />
        </div>
      </div>
    );
  }

  function conditionalRenderRight() {
    if (!blockForm) return "(show full preview)";
    if (blockForm.type === "annotationPhase") return "(show unit layout design)";
    if (blockForm.type === "surveyPhase") return "(show survey design)";
    if (blockForm.type === "surveyQuestion" || blockForm.type === "annotationQuestion")
      return "(show specific question design)";
  }

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-3 md:grid-cols-[600px,1fr] md:gap-9">
      {conditionalRenderLeft()}
      <div className="w-full text-center">{conditionalRenderRight()}</div>
    </div>
  );
}

interface CreateBlockProps {
  projectId: number;
  jobId: number;
  parentId: number | null;
  position: number;
  setBlockForm: (props: BlockFormProps) => void;
  newBlock?: boolean;
}

const typeLabel = {
  surveyQuestion: "Survey question",
  annotationQuestion: "Annotation question",
  surveyPhase: "Survey phase",
  annotationPhase: "Annotation phase",
};

function CreateBlock({ projectId, jobId, parentId, position, setBlockForm, newBlock }: CreateBlockProps) {
  const [open, setOpen] = useState(false);
  const { data: parent, isLoading: parentLoading } = useJobBlock(projectId, jobId, parentId || undefined);

  if (parentLoading) return null;

  const parentType = parentId ? parent?.type : null;
  const options = parentType !== undefined ? getValidChildren(parentType) : [];

  if (options.length === 0) return null;

  return (
    <div className="ml-auto flex h-3 items-center gap-3">
      {/* <div className="w-full border-b-2 border-secondary/30"></div> */}
      <SimplePopover
        open={open}
        setOpen={setOpen}
        trigger={
          <Button
            variant={newBlock ? "secondary" : "ghost"}
            size={newBlock ? "default" : "icon"}
            onClick={(e) => {
              if (options.length === 1) {
                setBlockForm({ projectId, jobId, parentId, position, type: options[0] });
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {newBlock ? "Create new phase" : null}
            <PlusIcon />
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {options.map((type) => {
            return (
              <Button
                key={type}
                onClick={() => {
                  setBlockForm({ projectId, jobId, parentId, position, type });
                  setOpen(false);
                }}
              >
                {typeLabel[type]}
              </Button>
            );
          })}
        </div>
      </SimplePopover>
    </div>
  );
}

interface BlockProps {
  block: JobBlockTreeResponse;
  projectId: number;
  jobId: number;
  setBlockForm: (props: BlockFormProps) => void;
}

function JobBlockItem({ block, projectId, jobId, setBlockForm }: BlockProps) {
  const { mutateAsync } = useUpdateJobBlockTree(projectId, jobId, block.id);
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const { data: content, isLoading: contentLoading } = useJobBlock(projectId, jobId, block.id);
  const router = useRouter();

  function header() {
    if (!content) return "...loading";
    if (content.type === "annotationPhase") return "Annotation";
    if (content.type === "surveyPhase") return "Survey";
    return content.name.replaceAll("_", " ");
  }

  function blockStyle() {
    if (block.level === 0) return "bg-primary/10 rounded-t border-b mb-1 font-bold";
  }

  const type = content?.type;

  return (
    <div className={`flex animate-fade-in items-center gap-1 ${blockStyle()}`}>
      <div className="max-w-full overflow-hidden rounded px-3" style={{ marginLeft: `${block.level}rem` }}>
        <div className="mt-1">
          <div className="flex items-center">
            {/* <Book className="h-4 w-4" /> */}
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-transparent hover:underline"
              disabled={!type}
              onClick={() => {
                if (!type) return null;
                setBlockForm({
                  projectId,
                  jobId,
                  position: block.position,
                  parentId: block.parentId,
                  type: type,
                  currentId: block.id,
                });
              }}
            >
              {header()}
            </Button>
            <CreateBlock
              projectId={projectId}
              jobId={jobId}
              parentId={block.id}
              position={block.children + 1}
              setBlockForm={setBlockForm}
            />
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => deleteBlock()}
          onClickConfirm={{
            title: "Are you sure?",
            message: `This will delete the block ${block.children > 0 ? "AND all it's children (!!!)" : ""}. Are you sure?`,
            enterText: block.children > 0 ? "delete" : undefined,
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
