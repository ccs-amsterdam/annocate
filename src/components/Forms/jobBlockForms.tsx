import { useCreateJobBlock, useJobBlock, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import {
  JobBlockCreateSchema,
  JobBlockSchema,
  JobBlockUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { JobBlock, JobBlockMeta } from "@/app/types";
import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form, FormMessage } from "../ui/form";
import { SelectCodebookFormField } from "./formHelpers";
import { useEffect } from "react";
import { Loading } from "../ui/loader";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockUpdate = z.infer<typeof JobBlockUpdateSchema>;

interface CreateJobBlockProps {
  projectId: number;
  jobId: number;
  position: number;
  phase: "preSurvey" | "annotate" | "postSurvey";
  currentId?: number;
  afterSubmit: () => void;
}

export function CreateOrUpdateJobBlock({
  projectId,
  jobId,
  phase,
  position,
  currentId,
  afterSubmit,
}: CreateJobBlockProps) {
  const { mutateAsync: createAsync } = useCreateJobBlock(projectId, jobId);
  const { mutateAsync: updateAsync } = useUpdateJobBlock(projectId, jobId, currentId);
  const { data: current, isLoading, isPending } = useJobBlock(projectId, jobId, currentId);

  const schema = JobBlockSchema;
  const shape = schema.shape;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(phase, position, current),
    // disabled: currentId !== undefined && isLoading,
  });

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

  let type: "annotation" | "survey" = "annotation";
  if (phase === "preSurvey" || phase === "postSurvey") type = "survey";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="grid grid-cols-[1fr] items-end gap-3">
          <SelectCodebookFormField
            control={form.control}
            zType={shape.codebookId}
            name="codebookId"
            projectId={projectId}
            type={type}
            current={current}
          />
        </div>
        <ErrorMessage errors={form.formState.errors} name="formError" render={({ message }) => <p>{message}</p>} />
        <Button type="submit">
          {current ? "update" : "create"} {type} block
        </Button>
        <FormMessage />
      </form>
    </Form>
  );
}

function defaultValues(
  phase: "preSurvey" | "annotate" | "postSurvey",
  position: number,
  current?: JobBlock,
): JobBlockUpdate {
  return {
    phase,
    codebookId: current?.codebookId || undefined,
    position: current?.position || position,
  };
}
