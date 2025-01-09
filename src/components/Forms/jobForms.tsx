import { useCreateJob, useUpdateJob } from "@/app/api/projects/[projectId]/jobs/query";
import { JobCreateSchema, JobMetaResponseSchema, JobUpdateSchema } from "@/app/api/projects/[projectId]/jobs/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { TextAreaFormField, TextFormField } from "./formHelpers";

type JobCreate = z.infer<typeof JobCreateSchema>;
type JobUpdate = z.infer<typeof JobUpdateSchema>;

interface CreatJobProps {
  projectId: number;
  afterSubmit: () => void;
}
interface UpdateJobProps {
  projectId: number;
  current: z.infer<typeof JobMetaResponseSchema>;
  afterSubmit: () => void;
}

export function CreateJob({ projectId, afterSubmit }: CreatJobProps) {
  const { mutateAsync } = useCreateJob(projectId);
  const form = useForm<JobCreate>({
    resolver: zodResolver(JobCreateSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: JobCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = JobCreateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}

export function UpdateJob({ projectId, current, afterSubmit }: UpdateJobProps) {
  const { mutateAsync } = useUpdateJob(projectId, current.id);
  const form = useForm<JobUpdate>({
    resolver: zodResolver(JobUpdateSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: JobUpdate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = JobUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}

// function unitsPlaceholder() {
//   if (currentId !== undefined && isLoading) return "Loading units...";
//   return `[unit id]\n[unit id]\n...\n\nleave empty to select all`;
// }

// function renderAnnotationFormFields() {
//   if (type !== "annotation") return null;
//   const shape = JobAnnotationBlockSchema.shape;
//   const rulesShape = shape.rules.shape;
//   return (
//     <div className="grid min-h-80 grid-cols-1 gap-3 md:grid-cols-2">
//       <div>
//         <TextAreaFormField
//           control={form.control}
//           zType={shape.units}
//           name="units"
//           className="h-full overflow-auto"
//           placeholder={unitsPlaceholder()}
//           asArray={true}
//         />
//       </div>
//       <div className="flex flex-col gap-3">
//         <DropdownFormField
//           control={form.control}
//           values={distributionModeOptions}
//           zType={rulesShape.mode}
//           name="rules.mode"
//         />
//         {mode === "crowd" ? (
//           <NumberFormField
//             control={form.control}
//             min={1}
//             zType={rulesShape.maxCodersPerUnit}
//             name="rules.maxCodersPerUnit"
//             clearable
//           />
//         ) : null}
//         {mode === "expert" || mode === "crowd" ? (
//           <NumberFormField
//             control={form.control}
//             min={1}
//             zType={rulesShape.maxUnitsPerCoder}
//             name="rules.maxUnitsPerCoder"
//             clearable
//           />
//         ) : null}
//         {mode === "expert" || mode === "crowd" ? (
//           <NumberFormField
//             control={form.control}
//             min={1}
//             zType={rulesShape.overlapUnits}
//             name="rules.overlapUnits"
//             clearable
//           />
//         ) : null}
//         {mode === "fixed" || mode === "expert" ? (
//           <BooleanFormField control={form.control} zType={rulesShape.randomizeUnits} name="rules.randomizeUnits" />
//         ) : null}
//       </div>
//     </div>
//   );
// }
