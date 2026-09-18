import { CreateOrUpdateCodebookNodes } from "@/components/Forms/codebookNodeForms";
import { WindowProps } from "./CodebookNodes";
import { CodebookNode } from "@/app/types";

export function CodebookNodeForm({
  projectId,
  jobId,
  codebookNodeForm,
  changesPending,
  setCodebookNodeForm,
  setPreview,
  showPreview,
  setChangesPending,
  codebookNodes,
}: WindowProps) {
  if (!codebookNodeForm) return null;
  if (!codebookNodes) return null;
  const current = codebookNodes.find((node) => node.id === codebookNodeForm.currentId);

  return (
    <div className="w-full max-w-[500px]">
      <CreateOrUpdateCodebookNodes
        key={codebookNodeForm.currentId ?? "new" + codebookNodeForm.type}
        projectId={projectId}
        jobId={jobId}
        parentId={codebookNodeForm.parentId}
        type={codebookNodeForm.type}
        position={codebookNodeForm.position}
        header={getLabel(codebookNodeForm.type)}
        current={current}
        afterSubmit={() => setCodebookNodeForm(null)}
        setPreview={setPreview}
        onCancel={() => setCodebookNodeForm(null)}
        defaultName={getDefaultName(codebookNodes, codebookNodeForm.type)}
        changesPending={changesPending}
        setChangesPending={setChangesPending}
      />
    </div>
  );
}

function getLabel(type: CodebookNode["data"]["type"]) {
  if (type === "Survey phase") return "Survey phase";
  if (type === "Annotation phase") return "Annotation phase";
  if (type === "Question") return "Question";
  return type;
}

function getDefaultName(nodes: CodebookNode[], type: CodebookNode["data"]["type"]) {
  const nameLabel = getLabel(type).replaceAll(" ", "_");
  let name = `${nameLabel}_1`;
  for (let i = 2; i < 1000; i++) {
    if (!nodes.find((block) => block.name === name)) break;
    name = `${nameLabel}_${i}`;
  }
  return name;
}
