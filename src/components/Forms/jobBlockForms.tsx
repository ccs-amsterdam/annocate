"use client";

import { useCreateJobBlock, useJobBlock, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import {
  JobAnnotationBlockSchema,
  JobBlockCreateSchema,
  JobBlockUpdateSchema,
  JobSurveyBlockSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { JobBlock, JobBlockMeta } from "@/app/types";
import { ErrorMessage } from "@hookform/error-message";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form, FormMessage } from "../ui/form";
import { BooleanFormField, NumberFormField, SelectCodebookFormField, TextAreaFormField } from "./formHelpers";
import { useEffect } from "react";
import { Loading } from "../ui/loader";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockUpdate = z.infer<typeof JobBlockUpdateSchema>;

interface CreatJobBlockProps {
  projectId: number;
  jobId: number;
  position: number;
  type: "survey" | "annotation";
  currentId?: number;
  afterSubmit: () => void;
}

export function CreateOrUpdateJobBlock({
  projectId,
  jobId,
  type,
  position,
  currentId,
  afterSubmit,
}: CreatJobBlockProps) {
  const { mutateAsync: createAsync } = useCreateJobBlock(projectId, jobId);
  const { mutateAsync: updateAsync } = useUpdateJobBlock(projectId, jobId, currentId);
  const { data: current, isLoading } = useJobBlock(projectId, jobId, currentId);

  console.log(current);
  const schema = type === "survey" ? JobSurveyBlockSchema : JobAnnotationBlockSchema;
  const shape = schema.shape;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(type, position, current),
    disabled: isLoading,
  });

  useEffect(() => {
    if (current) {
      form.reset(JobBlockCreateSchema.parse(current));
    }
  }, [current, form]);

  function onSubmit(values: JobBlockCreate) {
    if ("units" in values) values.units = values.units.filter((u) => u !== "");

    if (current) {
      const updateValues: JobBlockUpdate = { ...values };
      if (updateValues.type === "annotation") {
        if (JSON.stringify(updateValues.units) === JSON.stringify(current.units)) {
          delete updateValues.units;
        }
      }
      updateAsync(updateValues).then(afterSubmit).catch(console.error);
      return;
    } else {
      createAsync(values).then(afterSubmit).catch(console.error);
    }
  }

  function unitsPlaceholder() {
    if (isLoading) return "Loading units...";
    return `Select specific units by listing their IDs, or use all units by leaving this field empty. `;
  }

  function renderAnnotationFormFields() {
    if (type !== "annotation") return null;
    const shape = JobAnnotationBlockSchema.shape;
    const rulesShape = shape.rules.shape;
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <TextAreaFormField
            control={form.control}
            zType={shape.units}
            name="units"
            className="h-full overflow-auto"
            placeholder={unitsPlaceholder()}
            asArray={true}
          />
        </div>
        <div className="flex flex-col gap-3">
          <NumberFormField
            control={form.control}
            min={1}
            zType={rulesShape.maxCodersPerUnit}
            name="rules.maxCodersPerUnit"
            clearable
          />
          <NumberFormField
            control={form.control}
            min={1}
            zType={rulesShape.maxUnitsPerCoder}
            name="rules.maxUnitsPerCoder"
            clearable
          />
          <NumberFormField
            control={form.control}
            min={1}
            zType={rulesShape.overlapUnits}
            name="rules.overlapUnits"
            clearable
          />
          <BooleanFormField control={form.control} zType={rulesShape.randomizeUnits} name="rules.randomizeUnits" />
        </div>
      </div>
    );
  }

  // if (currentId !== undefined && isLoading) return <Loading />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <SelectCodebookFormField
          control={form.control}
          zType={shape.codebookId}
          name="codebookId"
          projectId={projectId}
          type={type}
          current={current}
        />
        {renderAnnotationFormFields()}
        <ErrorMessage errors={form.formState.errors} name="formError" render={({ message }) => <p>{message}</p>} />
        <Button type="submit">
          {current ? "update" : "create"} {type} block
        </Button>
        <FormMessage />
      </form>
    </Form>
  );
}

function defaultValues(type: "survey" | "annotation", position: number, current?: JobBlock): JobBlockUpdate {
  if (type === "survey")
    return {
      type: "survey",
      codebookId: current?.codebookId || undefined,
      position: current?.position || position,
    };
  if (type === "annotation")
    return {
      type: "annotation",
      codebookId: current?.codebookId || undefined,
      position: current?.position || position,
      units: current?.units || [],
      rules: current?.rules || { randomizeUnits: true },
    };
  throw new Error("Invalid type");
}
