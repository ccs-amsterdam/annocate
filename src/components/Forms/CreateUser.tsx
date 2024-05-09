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
import { UsersPostBody, UsersPostBodySchema } from "@/app/api/users/schemas";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Plus } from "lucide-react";

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
  const { user } = useMiddlecat();
  const form = useForm<UsersPostBody>({
    resolver: zodResolver(UsersPostBodySchema),
    defaultValues: {
      email: "",
      role: undefined,
    },
  });
  const { mutateAsync } = useMutateUsers(user);

  function onSubmit(values: UsersPostBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input placeholder="user@somewhere.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="mt-0">Role</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="guest" />
                    </FormControl>
                    <FormLabel className="w-14 font-normal">Guest</FormLabel>
                    <FormDescription>Can be invited to manage and code jobs</FormDescription>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="creator" />
                    </FormControl>
                    <FormLabel className="w-14 font-normal">Creator</FormLabel>
                    <FormDescription className="flex items-center gap-2">
                      <Plus className="h-4 w-4" /> can create new jobs
                    </FormDescription>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="admin" />
                    </FormControl>
                    <FormLabel className="w-14 font-normal">Admin</FormLabel>
                    <FormDescription className="flex items-center gap-2">
                      <Plus className="h-4 w-4" /> can manage users
                    </FormDescription>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              {/* <div>
                <FormDescription>Should this user have Admin priviledges? </FormDescription>
                <FormMessage />
              </div> */}
            </FormItem>
          )}
        />
        {/* <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex space-x-3 space-y-0">
              <FormControl>
                <Checkbox {...field} />
              </FormControl>
              <div>
                <FormLabel>Can create jobs</FormLabel>
                <FormDescription>Should this user be allowed to create new jobs? </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        /> */}
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}
