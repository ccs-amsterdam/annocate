import {
  useCreateCodebookNode,
  useDeleteCodebookNode,
  useUpdateCodebookNode,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import {
  CodebookNodeCreateSchema,
  CodebookNodeUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/schemas";
import { CodebookNode, CodebookNodeResponse } from "@/app/types";
import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn, useWatch } from "react-hook-form";
import { z, ZodError } from "zod";
import { Button } from "../ui/button";
import { Form, FormMessage } from "../ui/form";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loading } from "../ui/loader";
import { QuestionVariableForm } from "./questionVariableForm";
import { TextFormField } from "./formHelpers";
import { AnnotationPhaseNodeForm } from "./AnnotationPhaseBlockForm";
import { SurveyPhaseNodeForm } from "./SurveyPhaseBlockForm";
import { prepareCodebook } from "@/functions/treeFunctions";
import { DeleteNodeButton } from "@/app/projects/[projectId]/jobs/[jobId]/codebook/DeleteNodeButton";
import { ArrowBigLeft, ArrowBigUp, ArrowLeft, Eye, EyeOff, Trash, Trash2, Undo, X } from "lucide-react";

type CodebookNodeCreate = z.infer<typeof CodebookNodeCreateSchema>;
type CodebookNodeUpdate = z.infer<typeof CodebookNodeUpdateSchema>;

interface CreateCodebookNodeProps {
  projectId: number;
  jobId: number;
  type: CodebookNode["data"]["type"];
  parentId: number | null;
  position: number;
  setPreview?: (codebookNode: CodebookNode | undefined | ZodError) => void;
  current?: CodebookNode;
  afterSubmit: () => void;
  onCancel: () => void;
  header?: string;
  defaultName?: string;
  changesPending: boolean;
  setChangesPending: (value: boolean) => void;
}

export function CreateOrUpdateCodebookNodes({
  projectId,
  jobId,
  type,
  parentId,
  position,
  setPreview,
  current,
  afterSubmit,
  onCancel,
  header,
  defaultName,
  changesPending,
  setChangesPending,
}: CreateCodebookNodeProps) {
  const { mutateAsync: createAsync } = useCreateCodebookNode(projectId, jobId);
  const { mutateAsync: updateAsync } = useUpdateCodebookNode(projectId, jobId, current?.id || -1);

  const schema = CodebookNodeCreateSchema;

  const form = useForm<CodebookNodeCreate>({
    resolver: zodResolver(schema),
    defaultValues: current ?? { parentId, position, name: defaultName || "", data: { type } },
  });
  useWatchChanges({ form, setChangesPending });
  useUpdatePreview({ parentId, position, form, setPreview });

  useEffect(() => {
    if (!current) return;
    form.reset(CodebookNodeCreateSchema.parse(current));
  }, [current, form]);

  function onSubmit(values: CodebookNodeCreate) {
    if (current) {
      const updateValues: CodebookNodeUpdate = { ...values };
      updateAsync(updateValues).then(afterSubmit).catch(console.error);
      return;
    } else {
      createAsync(values).then(afterSubmit).catch(console.error);
    }
  }

  function renderForm() {
    if (type === "Question") return <QuestionVariableForm form={form} control={form.control} />;
    if (type === "Annotation phase") return <AnnotationPhaseNodeForm form={form} control={form.control} />;
    if (type === "Survey phase") return <SurveyPhaseNodeForm form={form} control={form.control} />;
  }

  const name = form.watch("name");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full w-full flex-col gap-3 font-light">
        <div className="mb-6 flex gap-3">
          {header && <h2 className="text-lg font-semibold">{name.replaceAll("_", " ")}</h2>}
          <div className="ml-auto flex gap-3">
            <DeleteButton node={current} projectId={projectId} jobId={jobId} afterSubmit={afterSubmit} />
            <Button type="submit" className="flex-auto" variant="secondary" disabled={current && !changesPending}>
              {current ? "Save" : "Create"}
            </Button>
          </div>
        </div>
        <ErrorMessage errors={form.formState.errors} name="formError" render={({ message }) => <p>{message}</p>} />
        {renderForm()}
        <FormMessage />
      </form>
    </Form>
  );
}

function DeleteButton({
  node,
  projectId,
  jobId,
  afterSubmit,
}: {
  node: CodebookNode | undefined;
  projectId: number;
  jobId: number;
  afterSubmit: () => void;
}) {
  const { mutateAsync: deleteAsync } = useDeleteCodebookNode(projectId, jobId, node?.id || -1);
  if (!node) return null;
  return (
    <Button
      size="icon"
      onClick={(e) => {
        e.preventDefault();
        deleteAsync().then(afterSubmit).catch(console.error);
      }}
      className={`${node ? "" : "hidden"}`}
      variant="outline"
      onClickConfirm={{
        title: "Are you sure?",
        message: `This will delete this codebook item${node.children.length > 0 ? " AND all it's children (!!!)" : ""}. Are you sure?`,
        enterText: node.children.length > 0 ? "delete" : undefined,
      }}
    >
      <Trash2 size={20} className="" />
    </Button>
  );
}

export function NameField({ form }: { form: UseFormReturn<CodebookNodeCreate> }) {
  // If block type has a name, use this form field
  // blocks with name: annotationQuestion, surveyQuestion
  // blocks without name: annotationPhase, surveyPhase
  // Names have to be unique if not null.
  return (
    <TextFormField
      control={form.control}
      zType={CodebookNodeCreateSchema}
      name={"name"}
      onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
    />
  );
}

function useWatchChanges({
  form,
  setChangesPending,
}: {
  form: UseFormReturn<CodebookNodeCreate>;
  setChangesPending: (value: boolean) => void;
}) {
  const watch = useWatch({ control: form.control });
  useEffect(() => {
    setChangesPending(form.formState.isDirty);
  }, [watch, form, setChangesPending]);
}

function useUpdatePreview({
  parentId,
  position,
  form,
  setPreview,
}: {
  parentId: number | null;
  position: number;
  form: UseFormReturn<CodebookNodeCreate>;
  setPreview?: (codebookNode: CodebookNode | undefined | ZodError) => void;
}) {
  const watch = useWatch({ control: form.control });
  const triggerRef = useRef(false);

  useEffect(() => {
    if (!setPreview) return;
    const timeout = setTimeout(() => {
      try {
        const codebookNode = CodebookNodeCreateSchema.parse(watch);
        const preview: CodebookNode = {
          id: -1,
          ...codebookNode,
          parentId,
          position,
          parentPath: [],
          children: [],
          treeType: "leaf",
          phaseType: "survey",
        };
        setPreview(preview);
        triggerRef.current = true;
        form.trigger();
      } catch (e: any) {
        if (e instanceof ZodError) setPreview(e);
        if (triggerRef.current) form.trigger();
      }
    }, 200);

    return () => {
      // setPreview(undefined);
      clearTimeout(timeout);
    };
  }, [watch, setPreview, form, parentId, position]);
}
