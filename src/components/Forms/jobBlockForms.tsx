import { useCreateJobBlock, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { JobBlockCreateSchema, JobBlockUpdateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { JobBlocksResponse } from "@/app/types";
import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn, useWatch } from "react-hook-form";
import { z, ZodError } from "zod";
import { Button } from "../ui/button";
import { Form, FormMessage } from "../ui/form";
import { useEffect, useMemo, useRef } from "react";
import { Loading } from "../ui/loader";
import { VariableBlockForm } from "./variableBlockForm";
import { TextFormField } from "./formHelpers";
import { AnnotationPhaseBlockForm } from "./AnnotationPhaseBlockForm";
import { SurveyPhaseBlockForm } from "./SurveyPhaseBlockForm";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockUpdate = z.infer<typeof JobBlockUpdateSchema>;

interface CreateJobBlockProps {
  projectId: number;
  jobId: number;
  type: JobBlocksResponse["data"]["type"];
  parentId: number | null;
  position: number;
  setPreview: (block: JobBlocksResponse | undefined | ZodError) => void;
  current?: JobBlocksResponse;
  afterSubmit: () => void;
  onCancel: () => void;
  header?: string;
  defaultName?: string;
  setChangesPending: (value: boolean) => void;
}

export function CreateOrUpdateJobBlock({
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
  setChangesPending,
}: CreateJobBlockProps) {
  const { mutateAsync: createAsync } = useCreateJobBlock(projectId, jobId);
  const { mutateAsync: updateAsync } = useUpdateJobBlock(projectId, jobId, current?.id || -1);

  const schema = JobBlockCreateSchema;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: current ?? { parentId, position, name: defaultName || "", data: { type } },
  });
  useWatchChanges({ form, setChangesPending });
  useUpdatePreview({ form, setPreview });

  useEffect(() => {
    if (!current) return;
    form.reset(JobBlockCreateSchema.parse(current));
  }, [current, form]);

  function onSubmit(values: JobBlockCreate) {
    if (current) {
      const updateValues: JobBlockUpdate = { ...values };
      updateAsync(updateValues).then(afterSubmit).catch(console.error);
      return;
    } else {
      createAsync(values).then(afterSubmit).catch(console.error);
    }
  }

  function renderForm() {
    if (type === "Question task") return <VariableBlockForm form={form} control={form.control} />;
    if (type === "Annotation phase") return <AnnotationPhaseBlockForm form={form} control={form.control} />;
    if (type === "Survey phase") return <SurveyPhaseBlockForm form={form} control={form.control} />;
  }

  const name = form.watch("name");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full w-full flex-col gap-3">
        <div className="mb-6 flex gap-3">
          {header && <h2 className="text-lg font-semibold">{name.replaceAll("_", " ")}</h2>}
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

function useWatchChanges({
  form,
  setChangesPending,
}: {
  form: UseFormReturn<JobBlockCreate>;
  setChangesPending: (value: boolean) => void;
}) {
  const watch = useWatch({ control: form.control });
  useEffect(() => {
    setChangesPending(form.formState.isDirty);
  }, [watch, form, setChangesPending]);
}

function useUpdatePreview({
  form,
  setPreview,
}: {
  form: UseFormReturn<JobBlockCreate>;
  setPreview: (block: JobBlocksResponse | undefined | ZodError) => void;
}) {
  const watch = useWatch({ control: form.control });
  const triggerRef = useRef(false);

  useEffect(() => {
    if (!setPreview) return;
    const timeout = setTimeout(() => {
      try {
        const jobBlock = JobBlockCreateSchema.parse(watch);
        setPreview({ ...jobBlock, id: 0, level: 0, children: 0, position: 0 });
        triggerRef.current = true;
        form.trigger();
      } catch (e: any) {
        if (e instanceof ZodError) setPreview(e);
        if (triggerRef.current) form.trigger();
      }
    }, 500);

    return () => {
      // setPreview(undefined);
      clearTimeout(timeout);
    };
  }, [watch, setPreview, form]);
}
