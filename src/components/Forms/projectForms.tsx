import { useUpdateProject, useCreateProject } from "@/app/api/projects/query";
import { ProjectsUpdateSchema, ProjectsResponseSchema } from "@/app/api/projects/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { TextFormField } from "./formHelpers";

type ProjectsCreate = z.infer<typeof ProjectsUpdateSchema>;
type ProjectsUpdate = z.infer<typeof ProjectsUpdateSchema>;

interface CreateProjectProps {
  afterSubmit: () => void;
}
interface UpdateProjectProps {
  current: z.infer<typeof ProjectsResponseSchema>;
  afterSubmit: () => void;
}

export function CreateProject({ afterSubmit }: CreateProjectProps) {
  const { mutateAsync } = useCreateProject();
  const form = useForm<ProjectsUpdate>({
    resolver: zodResolver(ProjectsUpdateSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: ProjectsCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = ProjectsUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Project</Button>
      </form>
    </Form>
  );
}

export function UpdateProject({ current, afterSubmit }: UpdateProjectProps) {
  const { mutateAsync } = useUpdateProject(current.id);
  const form = useForm<ProjectsUpdate>({
    resolver: zodResolver(ProjectsUpdateSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: ProjectsUpdate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = ProjectsUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}
