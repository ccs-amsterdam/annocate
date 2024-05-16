"use client";

import { useUpdateUsers } from "@/app/api/users/query";
import { roleOptions, UsersResponseSchema, UsersUpdateSchema } from "@/app/api/users/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { RadioFormField, TextFormField } from "./formHelpers";

type UsersUpdateBody = z.infer<typeof UsersUpdateSchema>;

interface UpdateUsersProps {
  current?: z.infer<typeof UsersResponseSchema>;
  afterSubmit: () => void;
}

export function UpdateUser({ current, afterSubmit }: UpdateUsersProps) {
  const form = useForm<UsersUpdateBody>({
    resolver: zodResolver(UsersUpdateSchema),
    defaultValues: current || {
      email: "",
      role: undefined,
    },
  });

  const { mutateAsync } = useUpdateUsers(current?.id);

  function onSubmit(values: UsersUpdateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = UsersUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {!current ? <TextFormField control={form.control} zType={shape.email} name="email" /> : null}
        <RadioFormField control={form.control} zType={shape.role} name="role" values={roleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}
