import {
  useCreateJobBlock,
  useJobBlockContent,
  useUpdateJobBlockContent,
  useUpdateJobBlockMeta,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import {
  JobBlockContentUpdateSchema,
  JobBlockCreateSchema,
  JobBlockMetaUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { JobBlock } from "@/app/types";
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
type JobBlockUpdate = z.infer<typeof JobBlockMetaUpdateSchema>;
type JobBlockContentUpdate = z.infer<typeof JobBlockContentUpdateSchema>;

interface CreateJobBlockProps {
  projectId: number;
  jobId: number;
  phase: JobBlock["phase"];
  type: JobBlock["type"];
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
  const { mutateAsync: updateAsync } = useUpdateJobBlockContent(projectId, jobId, currentId);
  const { data: currentContent, isLoading, isPending } = useJobBlockContent(projectId, jobId, currentId);
  const current: JobBlockCreate | undefined = useMemo(
    () => (currentContent ? { ...currentContent, phase, position, parentId } : undefined),
    [currentContent, phase, parentId, position],
  );

  const schema = JobBlockCreateSchema;
  const shape = schema.shape;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(type, phase, parentId, position),
    // disabled: currentId !== undefined && isLoading,
  });
  useUpdatePreview({ form, setPreview });

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
      const updateValues: JobBlockContentUpdate = { ...values };
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
      console.log(jobBlock.data);
      if (jobBlock.success) setPreview(jobBlock.data);
    }, 250);
    return () => clearTimeout(timeout);
  }, [watch, setPreview, form]);
}

function defaultValues(
  type: JobBlock["type"],
  phase: JobBlock["phase"],
  parentId: number | null,
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
