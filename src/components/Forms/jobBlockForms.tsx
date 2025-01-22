import {
  useCreateJobBlock,
  useJobBlock,
  useUpdateJobBlockContent,
  useUpdateJobBlockTree,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import {
  JobBlockContentSchemaBase,
  JobBlockContentUpdateSchema,
  JobBlockCreateSchema,
  JobBlockTreeUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { JobBlockResponse, JobBlockContentResponse } from "@/app/types";
import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form, FormMessage } from "../ui/form";
import { useEffect, useMemo } from "react";
import { Loading } from "../ui/loader";
import { VariableBlockForm } from "./variableBlockForm";
import { TextFormField } from "./formHelpers";
import { AnnotationPhaseBlockForm } from "./AnnotationPhaseBlockForm";
import { SurveyPhaseBlockForm } from "./SurveyPhaseBlockForm";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockContentUpdate = z.infer<typeof JobBlockContentUpdateSchema>;

interface CreateJobBlockProps {
  projectId: number;
  jobId: number;
  type: JobBlockResponse["type"];
  parentId: number | null;
  position: number;
  setPreview: (block: JobBlockCreate) => void;
  currentId?: number;
  afterSubmit: () => void;
  onCancel: () => void;
  header?: string;
}

export function CreateOrUpdateJobBlock({
  projectId,
  jobId,
  type,
  parentId,
  position,
  setPreview,
  currentId,
  afterSubmit,
  onCancel,
  header,
}: CreateJobBlockProps) {
  const { mutateAsync: createAsync } = useCreateJobBlock(projectId, jobId);
  const { mutateAsync: updateAsync } = useUpdateJobBlockContent(projectId, jobId, currentId);
  const { data: currentContent, isLoading } = useJobBlock(projectId, jobId, currentId);
  const current: JobBlockCreate | undefined = useMemo(
    () => (currentContent ? { ...currentContent, position, parentId } : undefined),
    [currentContent, parentId, position],
  );

  const schema = JobBlockCreateSchema;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(type, parentId, position),
    // disabled: currentId !== undefined && isLoading,
  });
  // useUpdatePreview({ form, setPreview });

  useEffect(() => {
    if (!current) return;
    form.reset(JobBlockCreateSchema.parse(current));
  }, [current, form]);

  function onSubmit(values: JobBlockCreate) {
    if (current) {
      const updateValues: JobBlockContentUpdate = { ...values };
      updateAsync(updateValues).then(afterSubmit).catch(console.error);
      return;
    } else {
      createAsync(values).then(afterSubmit).catch(console.error);
    }
  }

  function renderForm() {
    if (type === "annotationQuestion") return <VariableBlockForm form={form} control={form.control} />;
    if (type === "surveyQuestion") return <VariableBlockForm form={form} control={form.control} />;
    if (type === "annotationPhase") return <AnnotationPhaseBlockForm form={form} control={form.control} />;
    if (type === "surveyPhase") return <SurveyPhaseBlockForm form={form} control={form.control} />;
  }

  if (isLoading) return <Loading />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full w-full flex-col gap-3">
        <div className="mb-6 flex gap-3">
          {header && <h2 className="text-lg font-semibold">{header}</h2>}
          <div className="ml-auto flex w-[180px] gap-3">
            <Button
              onClick={(e) => {
                e.preventDefault();
                onCancel();
              }}
              variant="outline"
              className="flex-auto"
            >
              cancel
            </Button>
            <Button type="submit" className="flex-auto" variant="secondary">
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

export function NameField({ form }: { form: UseFormReturn<JobBlockCreate> }) {
  // If block type has a name, use this form field
  // blocks with name: annotationQuestion, surveyQuestion
  // blocks without name: annotationPhase, surveyPhase
  // Names have to be unique if not null.
  return (
    <TextFormField
      control={form.control}
      zType={JobBlockCreateSchema}
      name={"name"}
      onChangeInterceptor={(v) => v.replace(/ /g, "_").replace(/[^a-zA-Z0-9_]/g, "")}
    />
  );
}

function useUpdatePreview({
  form,
  setPreview,
}: {
  form: UseFormReturn<JobBlockCreate>;
  setPreview: (block: JobBlockCreate) => void;
}) {
  const watch = useWatch({ control: form.control });

  useEffect(() => {
    if (!setPreview) return;
    const timeout = setTimeout(() => {
      const jobBlock = JobBlockCreateSchema.safeParse(watch);
      if (jobBlock.success) setPreview(jobBlock.data);
    }, 250);
    return () => clearTimeout(timeout);
  }, [watch, setPreview, form]);
}

function defaultValues(type: JobBlockContentResponse["type"], parentId: number | null, position: number) {
  return {
    type,
    parentId: parentId,
    position: position,
    content: {},
  };
}
