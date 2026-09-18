import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useDeleteCodebookNode } from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { CodebookNodeRowProps } from "./CodebookList";

export function DeleteNodeButton({ setCodebookNodeForm, projectId, jobId, node }: CodebookNodeRowProps) {
  const { mutateAsync: deleteCodebookNode } = useDeleteCodebookNode(projectId, jobId, node.id);
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        setCodebookNodeForm(null);
        deleteCodebookNode();
      }}
      className="h-8 w-8 transition-none"
      onClickConfirm={{
        title: "Are you sure?",
        message: `This will delete the codebook item ${node.children.length > 0 ? "AND all it's children (!!!)" : ""}. Are you sure?`,
        enterText: node.children.length > 0 ? "delete" : undefined,
      }}
    >
      <X size={16} />
    </Button>
  );
}
