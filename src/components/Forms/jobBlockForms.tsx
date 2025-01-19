import {
  useCreateJobBlock,
  useJobBlock,
  useUpdateJobBlock,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import {
  JobBlockCreateSchema,
  JobBlockSchema,
  JobBlockUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { JobBlock, JobBlockMeta } from "@/app/types";
import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form, FormMessage } from "../ui/form";
import { useEffect, useMemo } from "react";
import { Loading } from "../ui/loader";
import { BlockVariable } from "./variableForms";
import { TextFormField } from "./formHelpers";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockUpdate = z.infer<typeof JobBlockUpdateSchema>;

interface CreateJobBlockProps {
  projectId: number;
  jobId: number;
  phase: JobBlock["phase"];
  type: JobBlock["type"];
  parentId?: number;
  position: number;
  setPreview: (block: JobBlockUpdate) => void;
  currentId?: number;
  afterSubmit: () => void;
  onCancel: () => void;
  header?: string;
}

export function CreateOrUpdateJobBlock({
  projectId,
  jobId,
  phase,
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
  const { mutateAsync: updateAsync } = useUpdateJobBlock(projectId, jobId, currentId);
  const { data: current, isLoading, isPending } = useJobBlock(projectId, jobId, currentId);

  const schema = JobBlockSchema;
  const shape = schema.shape;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(type, phase, parentId, position, current),
    // disabled: currentId !== undefined && isLoading,
  });

  useEffect(() => {
    if (!current) return;
    form.reset(JobBlockCreateSchema.parse(current));
  }, [current, form]);

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      e.returnValue = "Are you sure you want to leave? Any changes might be lost";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  function onSubmit(values: JobBlockCreate) {
    console.log(values);
    if (current) {
      const updateValues: JobBlockUpdate = { ...values };
      updateAsync(updateValues).then(afterSubmit).catch(console.error);
      return;
    } else {
      createAsync(values).then(afterSubmit).catch(console.error);
    }
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
        <BlockVariable form={form} control={form.control} />
        <FormMessage />
      </form>
    </Form>
  );
}

function useUpdatePreview({
  phase,
  form,
  setPreview,
}: {
  phase: "preSurvey" | "annotate" | "postSurvey";
  form: UseFormReturn<JobBlockCreate>;
  setPreview: (block: JobBlockUpdate) => void;
}) {
  const watch = useWatch({ control: form.control });

  useEffect(() => {
    const data = JobBlockSchema.safeParse(watch);
    if (data.success) setPreview(data.data);
  }, [watch, setPreview]);
}

function defaultValues(
  type: JobBlock["type"],
  phase: JobBlock["phase"],
  parentId: number | undefined,
  position: number,
  current?: JobBlock,
): JobBlockUpdate {
  return {
    type,
    phase,
    parentId: current?.parentId || parentId || null,
    position: current?.position || position,
  };
}
