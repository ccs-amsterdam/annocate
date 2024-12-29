import { useCreateJobBlock, useJobBlock, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import {
  distributionModeOptions,
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
import {
  BooleanFormField,
  DropdownFormField,
  NumberFormField,
  SelectCodebookFormField,
  TextAreaFormField,
  TextFormField,
} from "./formHelpers";
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
  const { data: current, isLoading, isPending } = useJobBlock(projectId, jobId, currentId);

  const schema = type === "survey" ? JobSurveyBlockSchema : JobAnnotationBlockSchema;
  const shape = schema.shape;

  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(type, position, current),
    // disabled: currentId !== undefined && isLoading,
  });

  const mode = form.watch("rules.mode");

  useEffect(() => {
    if (!current) return;
    form.reset(JobBlockCreateSchema.parse(current));
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
    if (currentId !== undefined && isLoading) return "Loading units...";
    return `[unit id]\n[unit id]\n...\n\nleave empty to select all`;
  }

  function renderAnnotationFormFields() {
    if (type !== "annotation") return null;
    const shape = JobAnnotationBlockSchema.shape;
    const rulesShape = shape.rules.shape;
    return (
      <div className="grid min-h-80 grid-cols-1 gap-3 md:grid-cols-2">
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
          <DropdownFormField
            control={form.control}
            values={distributionModeOptions}
            zType={rulesShape.mode}
            name="rules.mode"
          />
          {mode === "crowd" ? (
            <NumberFormField
              control={form.control}
              min={1}
              zType={rulesShape.maxCodersPerUnit}
              name="rules.maxCodersPerUnit"
              clearable
            />
          ) : null}
          {mode === "expert" || mode === "crowd" ? (
            <NumberFormField
              control={form.control}
              min={1}
              zType={rulesShape.maxUnitsPerCoder}
              name="rules.maxUnitsPerCoder"
              clearable
            />
          ) : null}
          {mode === "expert" || mode === "crowd" ? (
            <NumberFormField
              control={form.control}
              min={1}
              zType={rulesShape.overlapUnits}
              name="rules.overlapUnits"
              clearable
            />
          ) : null}
          {mode === "fixed" || mode === "expert" ? (
            <BooleanFormField control={form.control} zType={rulesShape.randomizeUnits} name="rules.randomizeUnits" />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="grid grid-cols-[1fr,1fr] items-end gap-3">
          <SelectCodebookFormField
            control={form.control}
            zType={shape.codebookId}
            name="codebookId"
            projectId={projectId}
            type={type}
            current={current}
          />
          <TextFormField
            control={form.control}
            zType={shape.name}
            name="name"
            className="w-full"
            placeholder={"(optional)"}
          />
        </div>
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
      name: current?.name || undefined,
      codebookId: current?.codebookId || undefined,
      position: current?.position || position,
    };
  if (type === "annotation")
    return {
      type: "annotation",
      name: current?.name || undefined,
      codebookId: current?.codebookId || undefined,
      position: current?.position || position,
      units: current?.units || [],
      rules: current?.rules || { mode: "expert", randomizeUnits: true },
    };
  throw new Error("Invalid type");
}
