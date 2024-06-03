"use client";

import {
  projectRoleOptions,
  ProjectUsersResponseSchema,
  ProjectUsersCreateOrUpdateSchema,
} from "@/app/api/projects/[projectId]/projectusers/schemas";

import { useCreateOrUpdateProjectUser } from "@/app/api/projects/[projectId]/projectusers/query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { RadioFormField, TextFormField } from "./formHelpers";

type ProjectUsersUpdateBody = z.infer<typeof ProjectUsersCreateOrUpdateSchema>;
type ProjectUsersCreateBody = z.infer<typeof ProjectUsersCreateOrUpdateSchema>;

interface CreateProjectUserProps {
  projectId: number;
  afterSubmit: () => void;
}

interface UpdateProjectUserProps {
  projectId: number;
  current: z.infer<typeof ProjectUsersResponseSchema>;
  afterSubmit: () => void;
}

export function CreateProjectUser({ projectId, afterSubmit }: CreateProjectUserProps) {
  const { mutateAsync } = useCreateOrUpdateProjectUser(projectId);
  const form = useForm<ProjectUsersCreateBody>({
    resolver: zodResolver(ProjectUsersCreateOrUpdateSchema),
    defaultValues: {
      email: "",
      role: undefined,
    },
  });

  function onSubmit(values: ProjectUsersCreateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = ProjectUsersCreateOrUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <TextFormField control={form.control} zType={shape.email} name="email" />
        <RadioFormField control={form.control} zType={shape.role} name="role" values={projectRoleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}

export function UpdateProjectUser({ projectId, current, afterSubmit }: UpdateProjectUserProps) {
  const { mutateAsync } = useCreateOrUpdateProjectUser(projectId);
  const form = useForm<ProjectUsersUpdateBody>({
    resolver: zodResolver(ProjectUsersCreateOrUpdateSchema),
    defaultValues: ProjectUsersCreateOrUpdateSchema.parse(current),
  });

  function onSubmit(values: ProjectUsersUpdateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = ProjectUsersCreateOrUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <RadioFormField control={form.control} zType={shape.role} name="role" values={projectRoleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}
