"use client";

import { useMutateUsers } from "@/app/api/users/query";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Button } from "../ui/button";
import { roleOptions, UsersPostBody, UsersPostBodySchema } from "@/app/api/users/schemas";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Plus } from "lucide-react";
import { RadioFormField, TextFormField } from "./formHelpers";

interface CreateUserDialogProps {
  children?: React.ReactNode;
}

export function CreateUserDialog({ children }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild className="flex">
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <CreateUser afterSubmit={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface CreateUserProps {
  afterSubmit: () => void;
}

export function CreateUser({ afterSubmit }: CreateUserProps) {
  const form = useForm<UsersPostBody>({
    resolver: zodResolver(UsersPostBodySchema),
    defaultValues: {
      email: "",
      role: undefined,
    },
  });
  const { mutateAsync } = useMutateUsers();

  function onSubmit(values: UsersPostBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  console.log(UsersPostBodySchema.shape.role);
  const shape = UsersPostBodySchema.shape;

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
