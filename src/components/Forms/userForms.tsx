import { useCreateUser, useUpdateUser } from "@/app/api/users/query";
import {
  roleOptions,
  UsersResponseSchema,
  UsersUpdateBodySchema,
  UsersCreateBodySchema,
} from "@/app/api/users/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { RadioFormField, TextFormField } from "./formHelpers";

type UsersUpdateBody = z.infer<typeof UsersUpdateBodySchema>;
type UsersCreateBody = z.infer<typeof UsersCreateBodySchema>;

interface CreateUserProps {
  afterSubmit: () => void;
}

interface UpdateUserProps {
  current: z.infer<typeof UsersResponseSchema>;
  afterSubmit: () => void;
}

export function CreateUser({ afterSubmit }: CreateUserProps) {
  const { mutateAsync } = useCreateUser();
  const form = useForm<UsersCreateBody>({
    resolver: zodResolver(UsersCreateBodySchema),
    defaultValues: {
      email: "",
      role: undefined,
    },
  });

  function onSubmit(values: UsersCreateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = UsersCreateBodySchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <TextFormField control={form.control} zType={shape.email} name="email" />
        <RadioFormField control={form.control} zType={shape.role} name="role" values={roleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}

export function UpdateUser({ current, afterSubmit }: UpdateUserProps) {
  const { mutateAsync } = useUpdateUser(current.id);
  const form = useForm<UsersUpdateBody>({
    resolver: zodResolver(UsersUpdateBodySchema),
    defaultValues: UsersUpdateBodySchema.parse(current),
  });

  function onSubmit(values: UsersUpdateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = UsersUpdateBodySchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <RadioFormField control={form.control} zType={shape.role} name="role" values={roleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}
