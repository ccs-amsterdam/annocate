"use client";

import { useCodebooks } from "@/app/api/projects/[projectId]/codebooks/query";
import { useCreateJobBlock, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import {
  JobAnnotationBlockSchema,
  JobBlockCreateSchema,
  JobBlockUpdateSchema,
  JobCreateSchema,
  JobSurveyBlockSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { JobBlock } from "@/app/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import DBSelect from "../Common/DBSelect";
import { Button } from "../ui/button";
import { Form, FormField, FormItem, FormMessage } from "../ui/form";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useCreateEmptyCodebook } from "./codebookForms";
import {
  BooleanFormField,
  FormFieldTitle,
  NumberFormField,
  OpenAPIMeta,
  SelectCodebookFormField,
  TextAreaFormField,
} from "./formHelpers";
import { ErrorMessage } from "@hookform/error-message";
import { TextFieldInput } from "@radix-ui/themes";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockUpdate = z.infer<typeof JobBlockUpdateSchema>;

interface CreatJobBlockProps {
  projectId: number;
  jobId: number;
  position: number;
  type: "survey" | "annotation";
  current?: JobBlock;
  afterSubmit: () => void;
}

export function CreateOrUpdateJobBlock({ projectId, jobId, type, position, current, afterSubmit }: CreatJobBlockProps) {
  const { mutateAsync: createAsync } = useCreateJobBlock(projectId, jobId);
  const { mutateAsync: updateAsync } = useUpdateJobBlock(projectId, jobId, current?.id);

  const schema = type === "survey" ? JobSurveyBlockSchema : JobAnnotationBlockSchema;
  const shape = schema.shape;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(type, position, current),
  });

  function onSubmit(values: JobBlockCreate) {
    if (current) {
      updateAsync(values).then(afterSubmit).catch(console.error);
      return;
    } else {
      createAsync(values).then(afterSubmit).catch(console.error);
    }
  }

  function renderAnnotationFormFields() {
    if (type !== "annotation") return null;
    const shape = JobAnnotationBlockSchema.shape;
    const rulesShape = shape.rules.shape;
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <TextAreaFormField control={form.control} zType={shape.units} name="units" className="h-full overflow-auto" />
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <SelectCodebookFormField
          control={form.control}
          zType={shape.codebookId}
          name="codebookId"
          projectId={projectId}
          current={current}
        />
        {renderAnnotationFormFields()}
        <ErrorMessage errors={form.formState.errors} name="formError" render={({ message }) => <p>{message}</p>} />
        <Button type="submit">Create {type} block</Button>
        <FormMessage />
      </form>
    </Form>
  );
}

function defaultValues(type: "survey" | "annotation", position: number, current?: JobBlock): JobBlockUpdate {
  if (type === "survey")
    return {
      type: "survey",
      position: current?.position || position,
    };
  if (type === "annotation")
    return {
      type: "annotation",
      position: current?.position || position,
      units: [],
      rules: current?.rules || { randomizeUnits: true },
    };
  throw new Error("Invalid type");
}
